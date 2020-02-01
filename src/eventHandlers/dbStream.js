/**
 * db stream handler
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module vault/streamHandler
 */

const { DEPLOY_REGION, GLOBAL_SERVICE_BUS } = process.env;
const logger = require("log-winston-aws-level");
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
AWS.config.update({ region: DEPLOY_REGION });
const stream = new AWS.Kinesis();

import { vault_metadata } from "../schema/vault.schema";
const { EVENT_TYPES, RECORD_TYPES } = vault_metadata;
import { unstring } from "../lib/awsHelpers/general.helper.library";
import { deindexDynamoRecord } from "../lib/awsHelpers/dynamoCRUD.helper.library";
import { generatePartitionKey, streamPublish } from "../lib/awsHelpers/kinesis.helper.library";
import { dynamoStreamEventPromisifier } from "../lib/awsHelpers/dynamoStream.helper.library";

/**
 * changes to items in the service table spawn events.
 * this function captures those events and hands down to processors.
 * @param event
 * @returns {Promise<void>}
 */
export const serviceTableStreamHandler = async ( event ) => {
  logger.info( "inside serviceTableStreamHandler", event );
  const tableUpdateAssembly = {
    incomingRecords: [ ...unstring( event.Records )]
  };
  logger.info( "table update assembly : ", tableUpdateAssembly );
  try {
    const workerResponse = await processTableStreamEvents( tableUpdateAssembly, stream );
    logger.info( "successfully processed stream events :", workerResponse );
  } catch ( err ) {
    logger.error( "error processing table stream event : ", err );
    throw err;
  }
}; // end serviceTableStreamHandler

export const processTableStreamEvents = async ( tableUpdateAssembly ) => {
  return dynamoStreamEventPromisifier( tableUpdateAssembly, processTableStreamEvent, stream )
}; // end processTableStreamEvents

const processTableStreamEvent = async ( record, stream ) => {
  logger.info( "inside processTableStreamEvent : ", record );
  switch( record.streamEventName ) {
    case "INSERT":
      return await processTableInsertEvent( record, stream );
    case "MODIFY":
    case "REMOVE":
    default:
      logger.info( `table event type ${ record.streamEventName } not handled : `, record );
  }
}; // end processTableStreamEvent

const processTableInsertEvent = async ( record ) => {
  logger.info( "inside processTableInsertEvent : ", record );
  const { newRec } = record;
  const { recordType, ...processRec } = deindexDynamoRecord( newRec );
  const calculatedEventType = calculateNewRecordEvent( recordType );
  logger.info( "calucated : ", calculatedEventType );
  let payloadRecord = {};
  switch( calculatedEventType ) {
    //TODO : handle SUBMITTED INSTRUMENT and SESSION REQUESTED (maybe)
    case EVENT_TYPES.INSTRUMENT_TOKENIZED:
      const { cardholderName, encryptedCardData, ...recordToShare } = processRec;
      payloadRecord = { ...recordToShare };
      logger.info( "record to share does it have instrumentId: ", payloadRecord );
      break;
    default:
      logger.info( `new record of type ${ recordType } not handled`);
      return;
  }
  try {
    const busResponse = await streamPublish(
      { ...payloadRecord },
      calculatedEventType,
      generatePartitionKey(),
      GLOBAL_SERVICE_BUS,
      stream );
    logger.info ( "bus response : ", busResponse );
  } catch( err ) {
    logger.error( "error pushing record to shared service bus", err );
    throw err;
  }
}; // end processTableInsertEvent

const calculateNewRecordEvent = ( recordType ) => {
  if( recordType === RECORD_TYPES.TOKENIZED_INSTRUMENT ) {
    return  EVENT_TYPES.INSTRUMENT_TOKENIZED;
  } else {
    return undefined;
  }
}; // end calculateNewRecordEvent

const processTableModifyEvent = async ( record ) => {
  // ONLY IF SUBMITTED INSTRUMENT FIRE
  //if( record.)
};