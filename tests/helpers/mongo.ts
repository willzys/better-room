import { mongoUrl } from './servers'

await mongoUrl()

export const mongoAddress = () => mongoUrl()
