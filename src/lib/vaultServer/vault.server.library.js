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
const logger = require( 'log-winston-aws-level' );
const luhn = require('luhn');

import {
  validateInboundCreditCard,
} from "../../schema/creditCard.schema";
import { vault_metadata } from "../../schema/vault.schema"
const { REQUEST_TYPES, RECORD_TYPES, RESOURCE_TYPES, ERROR_TYPES, JOI_ERRORS } = vault_metadata;

export const appendInstrument = async( instrumentAssembly, db, queue) => {
  logger.info("inside processAppendInstrumentSession : ", instrumentAssembly );
  const { sessionToken } = instrumentAssembly;
  const instrument = validateInboundCreditCard( instrumentAssembly );
  // TODO : need to test what failure does in the above validation
  logger.info( "the instrument or error : ", instrument );
  if( instrument.name === JOI_ERRORS.VALIDATION_ERROR ) {
    logger.error( ERROR_TYPES.INSTRUMENT_INVALID );
    return new Error(  ERROR_TYPES.INSTRUMENT_INVALID );
  }
  let session; // about to be populated from lookup
  try {
    const lookupResponse = await db.get({
      TableName: SERVICE_TABLE,
      Key: {
        hashKey: sessionToken,
        rangeKey: RECORD_TYPES.INSTRUMENT_SESSION
      }
    }).promise();
    logger.info( "successfully got session record : ", lookupResponse );
    session = lookupResponse.Item;
  } catch( err ) {
    logger.error( "error processing incoming instrument", err );
    throw err;
  }

  if( !session || session.captureSessionExpiry <= moment().unix() ) {
    logger.error( "capture session has expired" );
    throw Error( `Error ${ ERROR_TYPES.SESSION_EXPIRED }` );
  }

  const queueMessage = {
    MessageBody: JSON.stringify({
      eventPayload: { ...instrument,
        payerId: session.payerId,
        instrumentId: uuid.v4(),
        sessionToken
      },
      requestType: REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION
    }),
    QueueUrl: SERVICE_QUEUE
  };
  logger.info("about to push to queue: ", queueMessage );

  try {
    const queueResponse = await queue.sendMessage( queueMessage ).promise();
    logger.info( "successfully pushed message onto queue : ", queueResponse );
    const responseObject = { result: "OK", redirect: session.sessionRedirectUrl };
    logger.info("wrapped the response : ", responseObject );
    return ( responseObject )
  } catch( err ) {
    logger.error( "error pushing message to queue : ", err );
    throw err;
  }
}; // end  processAppendInstrumentSession