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
const util = require( "../lib/util.server.library" );

import {
  appendInstrument
} from "../lib/vault.server.library"
import {
  RESifySuccess,
  RESifyErr
} from "../lib/awsHelpers/RESifier.representor.library";
import { unstring } from "../lib/awsHelpers/general.helper.library";

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
    const queueSubmissionResponse = await appendInstrument( instrumentAssembly );
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