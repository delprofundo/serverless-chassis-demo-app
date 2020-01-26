/********************************************
 * generic_pay
 * vault secure access service
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
const {
  SERVICE_QUEUE,
  SERVICE_TABLE
} = process.env;

const uuid = require( "uuid" );
const moment = require( 'moment' );
const randString = require( 'randomstring' );
const logger = require( 'log-winston-aws-level' );
const luhn = require('luhn');

import {
  unstring
} from "../awsHelpers/general.helper.library";

import {
  creditCardMetadata,
  validateInboundCreditCard,
  validateStoredCreditCard
} from "../../schema/creditCard.schema";
import {
  validateGenericAsyncResponse,
  genericAsyncResponseMetadata
} from "../../schema/genericAsyncResponse.schema";
import { vault_metadata } from "../../schema/vault.schema"
const { REQUEST_TYPES, RECORD_TYPES, SESSION_VARIABLES, VALIDATION_ERROR } = vault_metadata;

export const processRequestInstrumentSession = async ( requestAssembly, queue ) => {
  const assembly = unstring( requestAssembly );
  const sessionToken = randString.generate( SESSION_VARIABLES.SESSION_TOKEN_LENGTH );
  try {
    const queuePayload = {
      eventPayload: { ...assembly, sessionToken},
      requestType: REQUEST_TYPES.NEW_INSTRUMENT_SESSION
    };
    const queueResponse = await queue.sendMessage({
      MessageBody: JSON.stringify( queuePayload ),
      QueueUrl: SERVICE_QUEUE
    }).promise();
    logger.info( "successfully put record : ", queueResponse );
    return { sessionToken }
  } catch ( err ) {
    logger.error( "error putting session record : ", err );
    throw err;
  }
}; //end processRequestInstrumentSession

export const appendInstrument = async( instrumentAssembly, db, queue) => {
  logger.info("inside processAppendInstrumentSession : ", instrumentAssembly );
  const { sessionToken } = instrumentAssembly;
  const instrument = validateInboundCreditCard( instrumentAssembly );
  // TODO : need to test what failure does in the above validation
  logger.info( "the instrument or error : ", instrument );
  if( instrument.name === VALIDATION_ERROR ) {
    logger.info( "instrument invalid" );
    return new Error( "Instrument invalid" );
  }
  try {
    const lookupResponse = await db.get({
      TableName: SERVICE_TABLE,
      Key: {
        hashKey: sessionToken,
        rangeKey: RECORD_TYPES.INSTRUMENT_SESSION
      }
    }).promise();
    const session = lookupResponse.Item;
    if( !session || session.captureSessionExpiry <= moment().unix() ) {
      logger.error( "capture session has expired" );
      return new Error( `session expired`);
    }
    logger.info( "successfully got session record : ", lookupResponse );
    instrument.payerId = session.payerId;
    instrument.instrumentId = uuid.v4();
  } catch( err ) {
    logger.error( "error processing incoming instrument", err );
    throw err;
  }
  const queueMessage = {
    MessageBody: JSON.stringify({
      eventPayload: { ...instrument },
      requestType: REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION
    }),
    QueueUrl: SERVICE_QUEUE
  };
  logger.info("about to push to queue: ", queueMessage );
  try {
    const queueResponse = await queue.sendMessage( queueMessage ).promise();
    logger.info( "successfully pushed message onto queue : ", queueResponse );
    const responseObject = validateGenericAsyncResponse({
      result: "OK",
      resourceId: instrument.payerId,
      resourceType: RESOURCE_TYPES.PAYER
    });
    logger.info("wrapped the response : ", responseObject );
    return ( responseObject )
  } catch( err ) {
    logger.error( "error pushing message to queue : ", err );
    throw err;
  }
}; // end  processAppendInstrumentSession

export const processSubmitInstrumentSession = async ( ) => {

}; //end processSubmitInstrumentSession