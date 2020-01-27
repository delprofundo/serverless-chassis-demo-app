/********************************************
 * generic_pay
 * vault service queue hander
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
import {deindexDynamoRecord, dynamoPut} from "../awsHelpers/dynamoCRUD.helper.library";

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
    recordType: RECORD_TYPES.SUBMITTED_INSTRUMENT,
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

const processSubmittedInstrumentSession = async ( incomingSession, db ) => {
  logger.info( "inside processSubmittedInstrumentSession : ", incomingSession );
  const { sessionToken, recordType } = incomingSession;
  // 1. get the record.
  const queryParams = {
    TableName: SERVICE_TABLE,
    KeyConditionExpression: "#HASH_KEY = :hash_key",
    ExpressionAttributeValues: {
      ":hash_key": sessionToken
    },
    ExpressionAttributeNames: {
      "#HASH_KEY": "hashKey"
    }
  };
  console.log( "query: ", queryParams );

  let instrumentRecord;
  let sessionRecord;

  try {
    let dbResponse = await db.query( queryParams ).promise();
    logger.info("SESSION RECORDS : ", dbResponse );
    instrumentRecord = deindexDynamoRecord(getRecordFromUniqueSet( dbResponse.Items, RECORD_TYPES.SUBMITTED_INSTRUMENT ));
    logger.info("inst : ", instrumentRecord);
    sessionRecord = deindexDynamoRecord(getRecordFromUniqueSet( dbResponse.Items, RECORD_TYPES.INSTRUMENT_SESSION ));
    logger.info( "sesh : ", sessionRecord );
  } catch ( err ) {
    logger.error( "error SUBMITTING INSTRUMENT SESSION", err );
    throw err;
  }
  // 2. check the record is complete and session has not expired (maybe not the expiry? );
  if( !validateInboundCreditCard( instrumentRecord )) {
    logger.error( "none of the vault session records are cards" );
    throw Error( "no valid card present in session" );
  }
  const { instrumentId } =  sessionRecord
  const { cardNumber, cardExpiry, cardCcv, instrumentType, cardholderName, cardScheme, cardCountry, payerId } = instrumentRecord;

  const tokenId = uuid.v4();

  const tokenizedInstrument = {
    hashKey: payerId,
    rangeKey: `${ RECORD_TYPES.TOKENIZED_INSTRUMENT}#${ instrumentId }`,
    recordType: RECORD_TYPES.TOKENIZED_INSTRUMENT,
    tokenId: tokenId,
    instrumentType,
    cardholderName,
    cardScheme,
    cardCountry,
    maskedCardNumber: maskIdentifier( cardNumber ),
    maskedExpiry: `***${ cardExpiry.slice(-1)}`,
    encryptedCardData: encryptString(`${ cardNumber }-${ cardExpiry }-${ cardCcv }`, CC_SIGNING_KEY )
  };
  logger.info('THE UPDATED CARD WITH ENCRYPTIONS : ', tokenizedInstrument );
  try {
    const dbResponse = await dynamoPut( tokenizedInstrument, SERVICE_TABLE, db );
    logger.info( "success putting tokenized instrument", dbResponse );
  } catch( err ) {
    logger.error( "error pushing tokenized instrument to collection : ", err );
    throw err;
  }
}; // end processSubmittedInstrumentSession

const getRecordFromUniqueSet = ( collection, recordType ) => {
  logger.info ( "IN GETG REC SET COLL :", collection );
  logger.info ( "IN GETG REC TYPE :", recordType );

  return collection.find( x => x.rangeKey === recordType )
};


