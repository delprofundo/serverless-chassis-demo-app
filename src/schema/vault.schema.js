const Joi = require("@hapi/joi");

const validate = ( schema, object, strip = true ) => {
  const { error, value } = schema.validate( object, { stripUnknown: strip } );
  if( error ) {
    throw new Error( error.details[0].message );
  }
  return value;
}; // end validate

const sessionRequestSchema = Joi.object({
  redirectUrl: Joi.string().uri().required(),
  payerId: Joi.string().guid({version: 'uuidv4'})
});


export const validateSessionRequest = ( object ) => {
  return validate( sessionRequestSchema, object )
};

const MASK_SCHEMES = {
  ONE_TWO: "ONE_TWO",
  FOUR_THREE: "FOUR_THREE"
};

const REQUEST_TYPES = {
  VAULT_SESSION_REQUESTED: "VAULT_SESSION_REQUESTED",
  APPEND_INSTRUMENT_TO_SESSION: "APPEND_INSTRUMENT_TO_SESSION"
};

const RECORD_TYPES = {
  INSTRUMENT_SESSION: "INSTRUMENT_SESSION",
  INSTRUMENT_RECORD: "INSTRUMENT_RECORD"
};

const INTERESTING_GLOBAL_EVENTS = {
  VAULT_SESSION_REQUESTED: "VAULT_SESSION_REQUESTED"
};

const RESOURCE_TYPES = {
  PAYER: "PAYER"
};

const SESSION_VARIABLES = {
  VAULT_EXPIRY_MINUTES: 30,
  SESSION_TOKEN_LENGTH: 128,
};

const VALIDATION_ERROR = "ValidationError";

export const vault_metadata = {
  INTERESTING_GLOBAL_EVENTS,
  MASK_SCHEMES,
  REQUEST_TYPES,
  RECORD_TYPES,
  RESOURCE_TYPES,
  SESSION_VARIABLES,
  VALIDATION_ERROR
};