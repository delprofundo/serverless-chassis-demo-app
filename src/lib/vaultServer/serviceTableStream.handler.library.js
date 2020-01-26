/********************************************
 * generic_pay
 * vault service dynamo stream handler
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
import { dynamoStreamEventPromisifier } from "../awsHelpers/dynamoStream.helper.library";

import { vault_metadata } from "../../schema/vault.schema"

export const  processTableStreamEvents = async ( tableUpdateAssembly, stream ) => {
  return dynamoStreamEventPromisifier( tableUpdateAssembly, processTableStreamEvent, stream )
}; // end processTableStreamEvents

const processTableStreamEvent = async ( record, stream ) => {
  logger.info( "inside processTableStreamEvent : ", record );
  switch( record.streamEventName ) {
    case "MODIFY":
      await processTableModifyEvent( record, stream );
      break;
    case "INSERT":
    case "REMOVE":
    default:
      logger.info( `table event type ${ record.streamEventName } not handled : `, record );
  }
}; // end processTableStreamEvent

const processTableModifyEvent = async ( record, stream ) => {
  // ONLY IF SUBMITTED INSTRUMENT FIRE
  //if( record.)
};