/********************************************
 * generic_pay
 * vault secure access service
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
const logger = require("log-winston-aws-level" );
const {
  API_ROOT,
  CC_SIGNING_KEY,
  DEPLOY_REGION,
  SERVICE_QUEUE,
  SERVICE_TABLE
} = process.env;

const uuid = require( "uuid" );
const request = require( 'request' );
const requestP = require( 'request-promise-native');
const moment = require( 'moment' );
const randString = require( 'randomstring' );
const logger = require( 'log-winston-aws-level' );
const luhn = require('luhn');

import {
  unstring
} from "../awsHelpers/general.helper.library";
import {
  queueEventPromisifier
} from "../awsHelpers/queue.helper.library";
import {
  creditCardMetadata,
  validateInboundCreditCard,
  validateStoredCreditCard
} from "./creditCard.schema";
import {
  validateGenericAsyncResponse,
  genericAsyncResponseMetadata
} from "../../schema/genericAsyncResponse.schema";
import {
  maskIdentifier,
  encryptString
} from 'treasury-helpers';

const VALIDATION_ERROR = "ValidationError";

const RESOURCE_TYPES = {
  PAYER: "PAYER"
};

const REQUEST_TYPES = {
  NEW_INSTRUMENT_SESSION: "NEW_INSTRUMENT_SESSION",
  APPEND_INSTRUMENT_TO_SESSION: "APPEND_INSTRUMENT_TO_SESSION"
};

const RECORD_TYPES = {
  INSTRUMENT_SESSION: "INSTRUMENT_SESSION",
  INSTRUMENT_RECORD: "INSTRUMENT_RECORD"
};

const SESSION_VARIABLES = {
  VAULT_EXPIRY_MINUTES: 30,
  SESSION_TOKEN_LENGTH: 128,
};

const MASK_SCHEMES = {
  ONE_TWO: "ONE_TWO",
  FOUR_THREE: "FOUR_THREE"
};

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

export const processServiceQueueMessages = async ( queueEvents, db ) => {
  return queueEventPromisifier( queueEvents, processInboundEvent, db );
}; // end processServiceQueueMessages

const processInboundEvent = async ( queueEvent, db ) => {
  logger.info( "inside processInboundEvent", queueEvent );
  const { requestType, eventPayload } = queueEvent;
  switch ( requestType ) {
    case REQUEST_TYPES.NEW_INSTRUMENT_SESSION:
      return processNewInstrumentSession( eventPayload, db );
    case REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION:
      return processAppendInstrumentSession( eventPayload, db );
    default:
      //TODO : push record to dump
      logger.info( "processInboundEvent switch fall through request type:", requestType );
      return;
  }
}; // end processInboundEvent

export const  processTableStreamEvents = async () => {

}; // end processTableStreamEvents

export const processBusStreamEvents = async () => {

}; // end processBusStreamEvents

const processNewInstrumentSession = async ( sessionRequest, db ) => {
  logger.info( "inside processNewInstrumentSession ", sessionRequest );
  const record = {
    instrumentId: uuid.v4(),
    captureSessionExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES, "minutes").unix(),
    sessionRedirectUrl: sessionRequest.redirectUrl,
    payerId: sessionRequest.payerId,
    sessionToken: sessionRequest.sessionToken,
    hashKey: sessionRequest.sessionToken,
    rangeKey: RECORD_TYPES.INSTRUMENT_SESSION,
    recordExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES * 2, "minutes").unix(),
  };
  try {
    const putResponse = await db.put({
      TableName: SERVICE_TABLE,
      Item: record
    }).promise();
    logger.info( "successfully put session to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument session" );
    throw err;
  }
}; // end processNewInstrumentSession

const processAppendInstrumentSession = async ( incomingInstrument, db ) => {
  const { instrumentId, payerId, cardNumber } = incomingInstrument;
  logger.info ( "inside processAppendInstrumentSession2", incomingInstrument );
  const ev = {
    ...incomingInstrument,
    encryptedCardNumber: encryptString( cardNumber, CC_SIGNING_KEY ),
    maskedCardNumber: maskIdentifier( cardNumber, MASK_SCHEMES.FOUR_THREE ),
    hashKey: payerId,
    rangeKey: `${ RECORD_TYPES.INSTRUMENT_RECORD }#${ instrumentId }`
  };
  let instrument;
  try {
    logger.info( "ev : ", ev );
    instrument = validateStoredCreditCard( ev );
  } catch ( err ) {
    logger.error( "error : in val ", err );
  }

  logger.info("parsed and can persist", instrument );
  try {
    const putResponse = await db.put({
      TableName: SERVICE_TABLE,
      Item: instrument
    }).promise();
    logger.info( "successfully put instrument to collection", putResponse );
  } catch( err ) {
    logger.error( "error processing new instrument", err );
    throw err;
  }
}; // end processAppendInstrumentSession