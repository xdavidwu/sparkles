import { OpenAPIV3 } from 'openapi-types';
import pointer from 'json-pointer';

export type SchemaOrRef = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;

export const dereference = (
  root: OpenAPIV3.Document,
  schema: SchemaOrRef,
): OpenAPIV3.SchemaObject => {
  let asRef = schema as OpenAPIV3.ReferenceObject;
  while (asRef.$ref) {
    if (asRef.$ref[0] === '#') {
      schema = pointer(root, asRef.$ref.substring(1));
      asRef = schema as OpenAPIV3.ReferenceObject;
    } else {
      throw new Error(`Unsupported non-local reference: ${asRef.$ref}`);
    }
  }

  const asSchema = schema as OpenAPIV3.SchemaObject;

  ['allOf', 'oneOf', 'anyOf'].forEach((k) => {
    const key = k as 'allOf' | 'oneOf' | 'anyOf';
    if (asSchema[key]) {
      asSchema[key] = asSchema[key]!.map((schemaOrRef: SchemaOrRef) => dereference(root, schemaOrRef));
    }
  });

  if (asSchema.properties) {
    Object.keys(asSchema.properties).forEach(
      (k) => asSchema.properties![k] = dereference(root, asSchema.properties![k]));
  }

  if (asSchema.not) {
    asSchema.not = dereference(root, asSchema.not);
  }

  if (asSchema.type === 'array') {
    const asArray = asSchema as OpenAPIV3.ArraySchemaObject;
    asArray.items = dereference(root, asArray.items);
  }

  if (asSchema.additionalProperties && typeof asSchema.additionalProperties !== 'boolean') {
    asSchema.additionalProperties = dereference(root, asSchema.additionalProperties);
  }

  return asSchema;
}
