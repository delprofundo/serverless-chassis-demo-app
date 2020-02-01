/**
 * service queue handler
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module vault/queueHanlder
 */
const {
  CC_SIGNING_KEY,
  SERVICE_TABLE
} = process.env;

import { unstring } from "../lib/awsHelpers/general.helper.library";
//import { processServiceQueueMessages } from "../lib/vaultServer/serviceQueue.handler.library";
import {
  processAppendInstrumentSession, processNewInstrumentSession
} from "../lib/vaultServer/vault.server.library";
import { queueEventPromisifier } from "../lib/awsHelpers/queue.helper.library";
import { vault_metadata } from "../schema/vault.schema";
import { deindexDynamoRecord, dynamoPut } from "../lib/awsHelpers/dynamoCRUD.helper.library";
import { validateInboundCreditCard } from "../schema/creditCard.schema";
import { encryptString, maskIdentifier } from "treasury-helpers";
const { REQUEST_TYPES, RECORD_TYPES } = vault_metadata;

/**
 * receives service bus messages and hands them down to be processed
 * successful ending clears the messages, error means they will be reprocessed
 * as such all commands that cross the queue must be idempotent.
 * @param event
 * @returns {Promise<void>}
 */
export const serviceQueueHandler = async ( event ) => {
  logger.info( "inside vault service queue handler : ", event );
  const queueEvents = [ ...unstring( event.Records )];
  logger.info( "queue events : ", queueEvents );
  try {
    await processServiceQueueMessages( queueEvents );
    logger.info( "success processing queue events : " );
  } catch( err ) {
    logger.error( "error processing queue events : ", err );
    throw err;
  }
}; // end serviceQueueHandler

export const processServiceQueueMessages = async ( queueEvents ) => {
  return queueEventPromisifier( queueEvents, processInboundEvent );
}; // end processServiceQueueMessages

const processInboundEvent = async ( queueEvent, db ) => {
  logger.info( "inside processInboundEvent", queueEvent );
  const { requestType, eventPayload } = queueEvent;
  switch ( requestType ) {
    case REQUEST_TYPES.VAULT_SESSION_REQUESTED:
      return processNewInstrumentSession( eventPayload );
    case REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION:
      return processAppendInstrumentSession( eventPayload );
    case REQUEST_TYPES.VAULT_SESSION_SUBMITTED:
      return processSubmittedInstrumentSession( eventPayload );
    default:
      //TODO : push record to dump
      logger.info( "processInboundEvent switch fall through request type:", requestType );
      return;
  }
}; // end processInboundEvent

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
    if( dbResponse.Count < 1 ) {
      // TODO : the submitted session arrived as it expired. need to back this out in the event source service
      logger.info( "session has expired, cancelling" );
      return;
    }
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
  const { instrumentId } =  sessionRecord;
  const { cardNumber, cardExpiry, cardCcv, instrumentType, cardholderName, cardScheme, cardCountry } = instrumentRecord;

  const tokenId = uuid.v4();

  const tokenizedInstrument = {
    hashKey: tokenId,
    rangeKey: `${ RECORD_TYPES.TOKENIZED_INSTRUMENT }#${ instrumentId }`,
    recordType: RECORD_TYPES.TOKENIZED_INSTRUMENT,
    tokenId: tokenId,
    instrumentType,
    instrumentId,
    cardholderName,
    cardScheme,
    cardCountry,
    maskedCardNumber: maskIdentifier( cardNumber ),
    maskedExpiry: `***${ cardExpiry.slice( -1 )}`,
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
  return collection.find( x => x.rangeKey === recordType )
};
