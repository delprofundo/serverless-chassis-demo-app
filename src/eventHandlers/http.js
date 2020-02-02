/**
 * service handler
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module vault/ServiceHandler
 */
const logger = require("log-winston-aws-level");
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
  const instrumentAssembly = {
    ...unstring( event.body ),
    sessionToken: unstring( event.pathParameters ).sessionToken
  };
  try {
    const queueSubmissionResponse = await appendInstrument( instrumentAssembly );
    return RESifySuccess(
      undefined,
      302,
      {"Location": queueSubmissionResponse.redirect}
      );
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