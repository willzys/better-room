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
