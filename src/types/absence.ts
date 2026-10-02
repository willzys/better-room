export type Absent = null

export type Unlinked<T> = T | Absent

export type Perpetual<T> = T | Absent

export type Unbounded<T> = T | Absent

export type Pending<T> = T | Absent

export type Unusable = Absent

export type Usable<T> = T | Unusable
