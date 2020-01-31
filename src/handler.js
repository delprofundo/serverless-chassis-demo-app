/**
 * service handler
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module vault/ServiceHandler
 */
const { DEPLOY_REGION } = process.env;
const logger = require("log-winston-aws-level");
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
AWS.config.update({ region: DEPLOY_REGION });
const util = require( "./lib/util.server.library" );

import {
  appendInstrument
} from "./lib/vaultServer/vault.server.library"
import { processBusStreamEvents } from "./lib/vaultServer/globalEventBus.handler.library";
import { processServiceQueueMessages } from "./lib/vaultServer/serviceQueue.handler.library"
import { processTableStreamEvents } from "./lib/vaultServer/serviceTableStream.handler.library"
import {
  RESifySuccess,
  RESifyErr
} from "./lib/awsHelpers/RESifier.representor.library";
import { unstring } from "./lib/awsHelpers/general.helper.library";

const db = new AWS.DynamoDB.DocumentClient();
const queue = new AWS.SQS();
const stream = new AWS.Kinesis();

///                                            ///
///             EXPORTED FUNCTIONS             ///
///                                            ///
//////////////////////////////////////////////////

/**
 * submit details to a current session. does not submit the session
 * just adds the input to it extra fields are ignored.
 * @param event
 * @returns {Promise<>}
 */
export const appendInstrumentSession = async ( event ) => {
  logger.info( "inside appendInstrumentSession : ", event );
  const instrumentAssembly = {
    ...unstring(event.body),
    sessionToken: unstring( event.pathParameters ).sessionToken
  };
  logger.info( "INSTRUMENT ASS : ", instrumentAssembly );
  try {
    const queueSubmissionResponse = await appendInstrument( instrumentAssembly, db, queue );
    logger.info( "successfully pushed request to queue : ", queueSubmissionResponse );
    const res = RESifySuccess(undefined, 302,  {"Location": queueSubmissionResponse.redirect} )
    logger.info( "RES : ", res );
    return ( res );
  } catch( err ) {
    logger.error( "error in appendInstrumentSession : ", err );
    return RESifyErr( err );
  }
}; // end appendInstrumentSession

/**
 * ping - simple GET test
 * @param event
 */
export const ping = async ( event ) => {
  try {
    return RESifySuccess( await util.ping())
  } catch( err ) {
    logger.error( "error in ping : ", err );
    throw RESifyErr( err );
  }
}; // end ping

/**
 * echo - simple POST test
 * @param event
 */
export const echo = async( event ) => {
  try {
    return RESifySuccess( await util.echo( event.body ));
  } catch( err ) {
    logger.error( "error in echo", err );
    return RESifyErr( err );
  }
}; // end echo

///                                            ///
///            INGEST QUEUE HANDLERS           ///
///                                            ///
//////////////////////////////////////////////////

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
    await processServiceQueueMessages( queueEvents, db );
    logger.info( "success processing queue events : " );
  } catch( err ) {
    logger.error( "error processing queue events : ", err );
    throw err;
  }
}; // end serviceQueueHandler

///                                            ///
///             SHARED BUS HANDLER             ///
///                                            ///
//////////////////////////////////////////////////

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

///                                            ///
///            TABLE STREAM HANDLERS           ///
///                                            ///
//////////////////////////////////////////////////

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