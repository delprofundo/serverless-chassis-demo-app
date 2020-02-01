

/**
 * inter service event bus handler
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module vault/busHanlder
 */
const { DEPLOY_REGION, SERVICE_QUEUE } = process.env;
const logger = require("log-winston-aws-level");
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
AWS.config.update({ region: DEPLOY_REGION });

import { kinesisStreamEventPromisifier } from "./lib/awsHelpers/kinesis.helper.library";
import { queuePush } from "./lib/awsHelpers/queue.helper.library";

import { vault_metadata } from "./schema/vault.schema";
const { REQUEST_TYPES, RECORD_TYPES, INTERESTING_GLOBAL_EVENTS } = vault_metadata;

const queue = new AWS.SQS();

export const sharedServiceBusEventHandler = async ( event ) => {
  logger.info( "inside sharedServiceBusEventHandler : ", event );
  const busEvents = [ ...event.Records ];
  logger.info("extracted bus events : ", busEvents );

  try {
    const workerResponse = await processBusStreamEvents( busEvents, queue, db );
    logger.info( "successfully processed bus records. worker response : ", workerResponse )
  } catch( err ) {
    logger.error( "error in sharedServiceBusEventHandler : ", err );
    throw err;
  }
}; // end sharedServiceBusEventHandler

export const processBusStreamEvents = async (busEvents, queue, db ) => {
  // extract the
  return kinesisStreamEventPromisifier( busEvents, processGlobalBusEvents, queue, db )
}; // end processBusStreamEvents

const processGlobalBusEvents = async ( event, queue, db ) => {
  logger.info("GOT THE BUS EVENT : ", event );

  switch( event.data.type ) {
    case INTERESTING_GLOBAL_EVENTS.VAULT_SESSION_REQUESTED:
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