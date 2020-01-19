const joi = require("@hapi/joi");
const logger = require( "log-winston-aws-level" );

const RESULTS = {
  OK: "OK",
  PENDING: "PENDING",
  ERROR: "ERROR"
};

const validate = ( schema, object, strip = true ) => {
  logger.info( "ASV")
  const { error, value } = schema.validate( object, { stripUnknown: strip });
  if( error ) {
    logger.error( "error validating GAR object" );
    return error;
  }
  logger.info("BNM", value);
  return value;
}; // end validate

const genericAsyncResponseSchema = joi.object({
  result: joi.string().valid( ...Object.values( RESULTS )).required(),
  resourceId: joi.string().guid({version: 'uuidv4'}).required(),
  resourceType: joi.string().required()
});

export const validateGenericAsyncResponse = ( object ) => {
  logger.info( "XYZ" );
  return validate( genericAsyncResponseSchema, object );
};

export const genericAsyncResponseMetadata = {
  RESULTS
};