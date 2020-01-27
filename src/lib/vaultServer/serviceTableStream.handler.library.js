/********************************************
 * generic_pay
 * vault service dynamo stream handler
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
import { dynamoStreamEventPromisifier } from "../awsHelpers/dynamoStream.helper.library";
const logger = require( 'log-winston-aws-level' );

import { vault_metadata } from "../../schema/vault.schema"
import {streamPublish} from "../awsHelpers/kinesis.helper.library";

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
  // put the event on the stream;

  // try {
  //   const busResponse = await streamPublish( recprd)
  // } catch( err ) {
  //   logger.error( "error pushing record to shared service bus", err );
  //   throw err;
  // }
}; // end processTableInsertEvent

const processTableModifyEvent = async ( record, stream ) => {
  // ONLY IF SUBMITTED INSTRUMENT FIRE
  //if( record.)
};