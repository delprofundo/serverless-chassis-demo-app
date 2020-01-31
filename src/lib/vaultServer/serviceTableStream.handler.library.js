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

  // put the event on the stream;
  logger.info( "==============================X==============================")
  const x = deindexDynamoRecord( newRec );
  logger.info( "==============================Y==============================")
  const y = calculateNewRecordEvent( newRec );
  logger.info( "==============================Z==============================")
  const z = generatePartitionKey();
  logger.info( "==============================E==============================")

  try {
    const busResponse = await streamPublish(
      x,
      y,
      z,
      GLOBAL_SERVICE_BUS,
      stream );
    logger.info( "success pushing record onto bus" );
  } catch( err ) {
    logger.error( "error pushing record to shared service bus", err );
    throw err;
  }
}; // end processTableInsertEvent

const calculateNewRecordEvent = ( record ) => {
  logger.info("in calculateNewRecordEvent : ", record );
  const { recordType } = record;
  logger.info (" RECO TYPE : ", recordType );
  let payloadRecord = {
    record: record,
    eventType: ""
  };
  if( recordType === RECORD_TYPES.TOKENIZED_INSTRUMENT ) {
    payloadRecord.eventType = EVENT_TYPES.INSTRUMENT_TOKENIZED
  }
  logger.info("PAYLOAD REC:  ", payloadRecord );
  return payloadRecord;
}; // end calculateNewRecordEvent

const processTableModifyEvent = async ( record, stream ) => {
  // ONLY IF SUBMITTED INSTRUMENT FIRE
  //if( record.)
};