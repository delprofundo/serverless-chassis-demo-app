/**
 * kinesis stream helper library
 * THESE HELPERS USED TO HANDLE STREAMS
 * 25 January 2020
 * delprofundo (@brunowatt)
 * bruno@hypermedia.tech
 * @module kinesis/streamHelper
 */

const logger = require( "log-winston-aws-level" );
const AWS = require( "aws-sdk" );


export const kinesisStreamEventPromisifier = async ( queueEvents, eventProcessorFunction, target1, target2 ) => {
  console.log( "in k promisifier : ", queueEvents );
  try {
    await Promise.all(queueEvents.map( async ( event ) => {
      return eventProcessorFunction( event, target1, target2 )
    }))
  } catch( err ) {
    logger.error( "error in table stream PROMISIFIER", err );
    throw err;
  }
}; // end kinesisStreamEventPromisifier