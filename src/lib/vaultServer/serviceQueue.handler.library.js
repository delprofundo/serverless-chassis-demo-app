/********************************************
 * generic_pay
 * vault service queue hander
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
const {
  CC_SIGNING_KEY,
  SERVICE_TABLE
} = process.env;

const moment = require( 'moment' );
const uuid = require( "uuid" );
const logger = require( 'log-winston-aws-level' );

import { encryptString, maskIdentifier } from "treasury-helpers";

import { queueEventPromisifier } from "../awsHelpers/queue.helper.library";
import { validateStoredCreditCard } from "../../schema/creditCard.schema";
import { vault_metadata } from "../../schema/vault.schema"
const { REQUEST_TYPES, RECORD_TYPES, SESSION_VARIABLES, MASK_SCHEMES } = vault_metadata;

export const processServiceQueueMessages = async ( queueEvents, db ) => {
  return queueEventPromisifier( queueEvents, processInboundEvent, db );
}; // end processServiceQueueMessages

const processInboundEvent = async ( queueEvent, db ) => {
  logger.info( "inside processInboundEvent", queueEvent );
  const { requestType, eventPayload } = queueEvent;
  switch ( requestType ) {
    case REQUEST_TYPES.VAULT_SESSION_REQUESTED:
      return processNewInstrumentSession( eventPayload, db );
    case REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION:
      return processAppendInstrumentSession( eventPayload, db );
    default:
      //TODO : push record to dump
      logger.info( "processInboundEvent switch fall through request type:", requestType );
      return;
  }
}; // end processInboundEvent

const processNewInstrumentSession = async ( sessionRequest, db ) => {
  logger.info( "inside processNewInstrumentSession ", sessionRequest );
  const record = {
    instrumentId: uuid.v4(),
    captureSessionExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES, "minutes").unix(),
    sessionRedirectUrl: sessionRequest.redirectUrl,
    payerId: sessionRequest.payerId,
    sessionToken: sessionRequest.sessionToken,
    hashKey: sessionRequest.sessionToken,
    rangeKey: RECORD_TYPES.INSTRUMENT_SESSION,
    recordExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES * 2, "minutes").unix(),
  };
  try {
    const putResponse = await db.put({
      TableName: SERVICE_TABLE,
      Item: record
    }).promise();
    logger.info( "successfully put session to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument session" );
    throw err;
  }
}; // end processNewInstrumentSession

const processAppendInstrumentSession = async ( incomingInstrument, db ) => {
  const { instrumentId, payerId, cardNumber } = incomingInstrument;
  logger.info ( "inside processAppendInstrumentSession2", incomingInstrument );
  const inboundRecord = {
    ...incomingInstrument,
    encryptedCardNumber: encryptString( cardNumber, CC_SIGNING_KEY ),
    maskedCardNumber: maskIdentifier( cardNumber, MASK_SCHEMES.FOUR_THREE ),
  };
  let validCard;
  try {
    validCard = validateStoredCreditCard( inboundRecord );
  } catch ( err ) {
    logger.error( "error : in val ", err );
    throw err;
  }
  const instrument = {
    ...validCard,
    hashKey: payerId,
    rangeKey: `${ RECORD_TYPES.INSTRUMENT_RECORD }#${ instrumentId }`,
  };
  console.log("INSTRUMENTED :", instrument );
  logger.info("parsed and can persist", instrument );
  try {
    const putResponse = await db.put({
      TableName: SERVICE_TABLE,
      Item: instrument
    }).promise();
    logger.info( "successfully put instrument to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument", err );
    throw err;
  }
}; // end processAppendInstrumentSession