/********************************************
 * generic_pay
 * vault service queue hander
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
import {dynamoPut} from "../awsHelpers/dynamoCRUD.helper.library";

const {
  CC_SIGNING_KEY,
  SERVICE_TABLE
} = process.env;

const moment = require( 'moment' );
const uuid = require( "uuid" );
const logger = require( 'log-winston-aws-level' );

import { encryptString, maskIdentifier } from "treasury-helpers";

import { queueEventPromisifier } from "../awsHelpers/queue.helper.library";
import {validateInboundCreditCard, validateStoredCreditCard} from "../../schema/creditCard.schema";
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
    case REQUEST_TYPES.VAULT_SESSION_SUBMITTED:
      return processSubmittedInstrumentSession( eventPayload, db );
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
    sessionRedirectUrl: sessionRequest.redirectUrl,
    payerId: sessionRequest.payerId,
    sessionToken: sessionRequest.sessionToken,
    hashKey: sessionRequest.sessionToken,
    rangeKey: RECORD_TYPES.INSTRUMENT_SESSION,
    recordExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES, "minutes").unix(),
  };
  try {
    const putResponse = await dynamoPut( record, SERVICE_TABLE, db );
    logger.info( "successfully put session to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument session" );
    throw err;
  }
}; // end processNewInstrumentSession

const processAppendInstrumentSession = async ( incomingInstrument, db ) => {
  const { instrumentId } = incomingInstrument;
  logger.info ( "inside processAppendInstrumentSession2", incomingInstrument );
  const { sessionToken, ...inboundRecord } = incomingInstrument;
  let validCard;
  try {
    validCard = validateInboundCreditCard( inboundRecord );
  } catch ( err ) {
    logger.error( "error : in val ", err );
    throw err;
  }
  const instrument = {
    ...validCard,
    hashKey: sessionToken,
    rangeKey: RECORD_TYPES.SUBMITTED_INSTRUMENT,
    recordExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES, "minutes").unix()
  };
  console.log("INSTRUMENTED :", instrument );
  logger.info("parsed and can persist", instrument );
  try {
    const putResponse = await dynamoPut( instrument, SERVICE_TABLE, db );
    logger.info( "successfully put instrument to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument", err );
    throw err;
  }
}; // end processAppendInstrumentSession

const processSubmittedInstrumentSession = async ( sessionRecord, db ) => {
  logger.info( "inside processSubmittedInstrumentSession : ", sessionRecord );
  // 1. get the record.
  // 2. check the record is complete and session has not expired (maybe not the expiry? );
  // 3. encrypt card-csv-expiry in one string
  // 4. create masked card
  // 5. create masked expiry
  // 6. generate new token
  // 7. remove pyerId and instrumentId
}; // end processSubmittedInstrumentSession
