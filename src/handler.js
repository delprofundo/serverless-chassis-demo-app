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
  processRequestInstrumentSession,
  processSubmitInstrumentSession,
  appendInstrument,
  processServiceQueueMessages,
  processTableStreamEvents,
  processBusStreamEvents
} from "./lib/vaultServer/vault.server.library"
import {
  RESifySuccess,
  RESifyErr
} from "./lib/awsHelpers/RESifier.representor.library";
import { unstring } from "./lib/awsHelpers/general.helper.library";

import { validateSessionRequest } from "./lib/vaultServer/vault.schema"

//ADD LIB's HERE
//declare the DB here and inject it to all calls that require it
const db = new AWS.DynamoDB.DocumentClient();
const queue = new AWS.SQS();
///                                            ///
///             EXPORTED FUNCTIONS             ///
///                                            ///
//////////////////////////////////////////////////
/**
 * initiates an instrument session, which will return a
 * URL the client app can submit payment instrument details to
 * @param event
 * @returns {Promise<{body: string, statusCode: *, headers: {"'Access-Control-Allow-Origin'": string, "'Access-Control-Allow-Credentials'": boolean}}|{body: string, statusCode: number, headers: {"'Access-Control-Allow-Origin'": string, "'Access-Control-Allow-Credentials'": boolean}}>}
 */
export const requestInstrumentSession = async ( event ) => {
  logger.info( "inside requestVaultSession : ", event );
  const requestAssembly = { ...unstring(event.body) };

  if( !validateSessionRequest(requestAssembly)) {
    return RESifyErr( new Error("Invalid request structure"), 400)
  }

  try{
    const requestedSessionInfo = await processRequestInstrumentSession( requestAssembly, queue );
    logger.info("successfully requested session : ", requestedSessionInfo );
    return RESifySuccess( requestedSessionInfo );
  } catch ( err ) {
    logger.error( "error in requestVaultSession : ", err );
    return RESifyErr( err );
  }
}; // end requestVaultSession

/**
 * requests that the information stored within the instrument
 * session be parsed and submitted for secure storage
 * @param event
 * @returns {Promise<{body: string, statusCode: *, headers: {"'Access-Control-Allow-Origin'": string, "'Access-Control-Allow-Credentials'": boolean}}>}
 */
export const submitInstrumentSession = async ( event ) => {
  logger.info( "inside submitInstrumentSession : ", event );
  const { sessionToken } = event.pathParameters;
  try {
    const queueSubmissionResponse = await processSubmitInstrumentSession( sessionToken );
    return ( RESifySuccess( queueSubmissionResponse ));
  } catch( err ) {
    logger.error( "error in submitInstrumentSession : ", err );
    return RESifyErr( err );
  }
}; // end submitInstrumentSession

/**
 * submit details to a current session. does not submit the session
 * just adds the input to it extra fields are ignored.
 * @param event
 * @returns {Promise<{body: string, statusCode: *, headers: {"'Access-Control-Allow-Origin'": string, "'Access-Control-Allow-Credentials'": boolean}}>}
 */
export const appendInstrumentSession = async ( event ) => {
  logger.info( "inside appendInstrumentSession : ", event );
  const instrumentAssembly = {
    ...unstring(event.body),
    sessionToken: unstring(event.pathParameters).sessionToken
  };
  logger.info( "INSTRUMENT ASS : ", instrumentAssembly );
  try {
    const queueSubmissionResponse = await appendInstrument( instrumentAssembly, db, queue );
    logger.info( "successfully pushed request to queue : ", queueSubmissionResponse );
    return ( RESifySuccess( queueSubmissionResponse ));
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
  const busEvents = { ...unstring(event.Records )};
  logger.info("extracted bus events : ", busEvents );

  try {
    const workerResponse = await processBusStreamEvents( busEvents );
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
   const workerResponse = await processTableStreamEvents( tableUpdateAssembly );
   logger.info( "successfully processed stream events :", workerResponse );
  } catch ( err ) {
    logger.error( "error processing table stream event : ", err );
    throw err;
  }
}; // end serviceTableStreamHandler
