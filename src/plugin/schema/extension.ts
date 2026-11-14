import type { DBFieldAttribute } from 'better-auth/db'

type AdditionalFields = Record<string, DBFieldAttribute>

export type Extendable = {
  additionalFields?: AdditionalFields
}

const extended = <Fields extends AdditionalFields>(
  table: string,
  fields: Fields,
  additionalFields: AdditionalFields = {}
): Fields & AdditionalFields => {
  for (const name of Object.keys(additionalFields)) {
    if (name === 'id' || Object.hasOwn(fields, name)) {
      throw new TypeError(
        `${table}.additionalFields.${name} collides with a field better-room owns`
      )
    }
  }

  return { ...fields, ...additionalFields }
}

export const extendedTable = <Table extends { fields: AdditionalFields }>(
  name: string,
  table: Table,
  extension?: Extendable
) => ({
  ...table,
  fields: extended(name, table.fields, extension?.additionalFields)
})

export const distinctColumns = <
  Schema extends Record<string, { fields: AdditionalFields }>
>(
  schema: Schema
): Schema => {
  for (const [table, { fields }] of Object.entries(schema)) {
    const owners = new Map([['id', 'id']])

    for (const [name, field] of Object.entries(fields)) {
      const column = field.fieldName ?? name
      const owner = owners.get(column)

      if (owner !== undefined) {
        throw new TypeError(
          `${table}.${name} is stored as ${column}, which ${table}.${owner} already uses`
        )
      }
      owners.set(column, name)
    }
  }

  return schema
}
