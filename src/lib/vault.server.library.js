/********************************************
 * generic_pay
 * vault secure access service
 * 17 Jan 2020
 * delProfundo (@brunowatt)
 * bruno@hypermedia.tech
 ********************************************/
const {
  SERVICE_QUEUE,
  SERVICE_TABLE,
  CC_SIGNING_KEY,
  DEPLOY_REGION
} = process.env;

const logger = require("log-winston-aws-level");
const AWSXRay = require("aws-xray-sdk-core");
const AWS = AWSXRay.captureAWS(require("aws-sdk"));
AWS.config.update({ region: DEPLOY_REGION });
const db = new AWS.DynamoDB.DocumentClient();
const queue = new AWS.SQS();
const uuid = require( "uuid" );
const moment = require( 'moment' );

import {
  validateInboundCreditCard,
} from "../schema/creditCard.schema";
import { encryptString, maskIdentifier } from "treasury-helpers";
import { deindexDynamoRecord, dynamoGet, dynamoPut } from "./awsHelpers/dynamoCRUD.helper.library";
import { queuePush } from "./awsHelpers/queue.helper.library";
import { vault_metadata } from "../schema/vault.schema"
const {
  REQUEST_TYPES, RECORD_TYPES, RESOURCE_TYPES,
  ERROR_TYPES, JOI_ERRORS, SESSION_VARIABLES
} = vault_metadata;

export const appendInstrument = async( instrumentAssembly ) => {
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
    const lookupResponse = await dynamoGet(
      sessionToken,
      RECORD_TYPES.INSTRUMENT_SESSION,
      SERVICE_TABLE, db
    );
    logger.info( "successfully got session record : ", lookupResponse );
    session = lookupResponse.Item;
  } catch( err ) {
    logger.error( "error processing incoming instrument", err );
    throw err;
  }

  if( !session || session.recordExpiry <= moment().unix() ) {
    logger.error( "capture session has expird" );
    throw Error( `Error ${ ERROR_TYPES.SESSION_EXPIRED }` );
  }
  try {
    const eventPayload =  { ...instrument,
      payerId: session.payerId,
      instrumentId: uuid.v4(),
      sessionToken
    };
    logger.info("about to push to queue: ", eventPayload );
    const queueResponse = await queuePush(
      eventPayload,
      REQUEST_TYPES.APPEND_INSTRUMENT_TO_SESSION,
      SERVICE_QUEUE, queue
    );
    logger.info( "successfully pushed message onto queue : ", queueResponse );
    const responseObject = { result: "OK", redirect: session.sessionRedirectUrl };
    logger.info("wrapped the response : ", responseObject );
    return ( responseObject )
  } catch( err ) {
    logger.error( "error pushing message to queue : ", err );
    throw err;
  }
}; // end  processAppendInstrumentSession

export const processNewInstrumentSession = async ( sessionRequest ) => {
  logger.info( "inside processNewInstrumentSession ", sessionRequest );
  const { instrumentId, payerId, sessionToken, redirectUrl, recordExpiry } = sessionRequest;
  const record = {
    instrumentId, payerId, sessionToken, recordExpiry,
    recordType: RECORD_TYPES.INSTRUMENT_SESSION,
    sessionRedirectUrl: redirectUrl,
    hashKey: sessionToken,
    rangeKey: RECORD_TYPES.INSTRUMENT_SESSION
  };
  try {
    await dynamoPut( record, SERVICE_TABLE, db );
    logger.info( "successfully put session to collection" );
  } catch( err ) {
    logger.error( "error processing new instrument session" );
    throw err;
  }
  try {
    const sessionIndexRecord = {
      hashKey: instrumentId,
      rangeKey: RECORD_TYPES.INSTRUMENT_SESSION_INDEX,
      sessionToken, recordExpiry };
    await dynamoPut( sessionIndexRecord, SERVICE_TABLE, db );
    logger.info( "index put response : " );
  } catch ( err ) {
    logger.error( "error putting session index record : ", err );
    throw err;
  }
}; // end processNewInstrumentSession

export const processAppendInstrumentSession = async ( incomingInstrument ) => {
  logger.info ( "inside processAppendInstrumentSession2", incomingInstrument );
  const { sessionToken, ...inboundRecord } = incomingInstrument;
  let validCard;
  try {
    validCard = validateInboundCreditCard( inboundRecord );
  } catch ( err ) {
    logger.error( "error : in val ", err );
    throw err;
  }
  const instrument = {
    ...validCard,
    recordType: RECORD_TYPES.SUBMITTED_INSTRUMENT,
    hashKey: sessionToken,
    rangeKey: RECORD_TYPES.SUBMITTED_INSTRUMENT,
    recordExpiry: moment().add( SESSION_VARIABLES.VAULT_EXPIRY_MINUTES, "minutes").unix()
  };
  logger.info("parsed and can persist", instrument );
  try {
    await dynamoPut( instrument, SERVICE_TABLE, db );
  } catch( err ) {
    logger.error( "error processing new instrument", err );
    throw err;
  }
}; // end processAppendInstrumentSession

export const processSubmittedInstrumentSession = async ( incomingSession ) => {
  logger.info( "inside processSubmittedInstrumentSession : ", incomingSession );
  const { sessionToken, recordType } = incomingSession;
  // 1. get the record.
  const queryParams = {
    TableName: SERVICE_TABLE,
    KeyConditionExpression: "#HASH_KEY = :hash_key",
    ExpressionAttributeValues: {
      ":hash_key": sessionToken
    },
    ExpressionAttributeNames: {
      "#HASH_KEY": "hashKey"
    }
  };
  console.log( "query: ", queryParams );

  let instrumentRecord;
  let sessionRecord;

  try {

    let dbResponse = await db.query( queryParams ).promise();
    logger.info("SESSION RECORDS : ", dbResponse );
    if( dbResponse.Count < 1 ) {
      // TODO : the submitted session arrived as it expired. need to back this out in the event source service
      logger.info( "session has expired, cancelling" );
      return;
    }
    instrumentRecord = deindexDynamoRecord(getRecordFromUniqueSet( dbResponse.Items, RECORD_TYPES.SUBMITTED_INSTRUMENT ));
    sessionRecord = deindexDynamoRecord(getRecordFromUniqueSet( dbResponse.Items, RECORD_TYPES.INSTRUMENT_SESSION ));
  } catch ( err ) {
    logger.error( "error SUBMITTING INSTRUMENT SESSION", err );
    throw err;
  }
  if( !validateInboundCreditCard( instrumentRecord )) {
    logger.error( "none of the vault session records are cards" );
    throw Error( "no valid card present in session" );
  }
  const { instrumentId } =  sessionRecord;
  const {
    cardNumber, cardExpiry, cardCcv, instrumentType,
    cardholderName, cardScheme, cardCountry
  } = instrumentRecord;
  const tokenId = uuid.v4();
  const tokenizedInstrument = {
    hashKey: tokenId,
    rangeKey: `${ RECORD_TYPES.TOKENIZED_INSTRUMENT }#${ instrumentId }`,
    recordType: RECORD_TYPES.TOKENIZED_INSTRUMENT,
    tokenId: tokenId,
    instrumentType,
    instrumentId,
    cardholderName,
    cardScheme,
    cardCountry,
    maskedCardNumber: maskIdentifier( cardNumber ),
    maskedExpiry: `***${ cardExpiry.slice( -1 )}`,
    encryptedCardData: encryptString(`${ cardNumber }-${ cardExpiry }-${ cardCcv }`, CC_SIGNING_KEY )
  };
  logger.info('THE UPDATED CARD WITH ENCRYPTIONS : ', tokenizedInstrument );
  try {
    const dbResponse = await dynamoPut( tokenizedInstrument, SERVICE_TABLE, db );
    logger.info( "success putting tokenized instrument", dbResponse );
  } catch( err ) {
    logger.error( "error pushing tokenized instrument to collection : ", err );
    throw err;
  }
}; // end processSubmittedInstrumentSession

const getRecordFromUniqueSet = ( collection, recordType ) => {
  return collection.find( x => x.rangeKey === recordType )
};
