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