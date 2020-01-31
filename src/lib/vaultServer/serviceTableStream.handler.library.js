/********************************************
 * generic_pay
 * vault service dynamo stream handler
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
const { GLOBAL_SERVICE_BUS } = process.env;
const logger = require( 'log-winston-aws-level' );

import { generatePartitionKey, streamPublish } from "../awsHelpers/kinesis.helper.library";
import { deindexDynamoRecord } from "../awsHelpers/dynamoCRUD.helper.library";
import { dynamoStreamEventPromisifier } from "../awsHelpers/dynamoStream.helper.library";
import { vault_metadata } from "../../schema/vault.schema"
const { EVENT_TYPES, RECORD_TYPES } = vault_metadata;

export const  processTableStreamEvents = async ( tableUpdateAssembly, stream ) => {
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

const processTableInsertEvent = async ( record, stream ) => {
  logger.info( "inside processTableInsertEvent : ", record );
  const { newRec } = record;
  const { recordType } = newRec;
  const calculatedEventType = calculateNewRecordEvent( recordType );
  logger.info( "calucated : ", calculatedEventType );
  let recordToShare = {};
  switch( calculatedEventType ) {
    //TODO : handle SUBMITTED INSTRUMENT and SESSION REQUESTED (maybe)
    case EVENT_TYPES.INSTRUMENT_TOKENIZED:
      const { cardholderName, encryptedCardData, ...payloadRecord } = deindexDynamoRecord( newRec );
      recordToShare = { ...payloadRecord };
      break;
    default:
      logger.info( `new record of type ${ recordType } not handled`);
      return;
  }
  try {
    const busResponse = await streamPublish(
      { ...recordToShare },
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

const processTableModifyEvent = async ( record, stream ) => {
  // ONLY IF SUBMITTED INSTRUMENT FIRE
  //if( record.)
};