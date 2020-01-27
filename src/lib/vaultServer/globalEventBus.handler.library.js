/********************************************
 * generic_pay
 * vault global event bus handler
 * 26 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/

const {
  SERVICE_QUEUE
} = process.env;

const logger = require( 'log-winston-aws-level' );
import { queuePush } from "../awsHelpers/queue.helper.library";
import { kinesisStreamEventPromisifier } from "../awsHelpers/kinesis.helper.library";
import { vault_metadata } from "../../schema/vault.schema"
const { REQUEST_TYPES, RECORD_TYPES, INTERESTING_GLOBAL_EVENTS } = vault_metadata;

export const processBusStreamEvents = async (busEvents, queue, db ) => {
  // extract the
  return kinesisStreamEventPromisifier( busEvents, processGlobalBusEvents, queue, db )
}; // end processBusStreamEvents

const processGlobalBusEvents = async ( event, queue, db ) => {
  logger.info("GOT THE BUS EVENT : ", event );

  switch( event.data.type ) {
    case INTERESTING_GLOBAL_EVENTS.VAULT_SESSION_REQUESTED:
      return await processVaultSessionRequest( event, queue );
    case INTERESTING_GLOBAL_EVENTS.VAULT_SESSION_SUBMITTED:
      return await processVaultSessionRequest( event, queue );
    default:
      logger.info( `uninteresting event of type ${ event.data.type  } ignored` );
  }
};

const processVaultSessionRequest = async ( event, queue ) => {
  logger.info( "inside process vault session request : ", event );
  try{
    const queueResponse = await queuePush( {...event.data.item}, event.data.type, SERVICE_QUEUE, queue );
    logger.info( "success response putting request on queue : ", queueResponse );
  } catch ( err ) {
    logger.error( "error processing vault session request down to queue : ", err );
    throw err;
  }
}; // end processVaultSessionRequest