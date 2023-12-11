import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { v4 as uuidv4 } from 'uuid'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'COP',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true
})

export const generateGuestId = () => `guest_${uuidv4()}`

export const generateOrderNumber = () =>
  `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

export const generateRandomSKU = () =>
  `SKU-${String(Date.now()).slice(-5)}-${Math.floor(Math.random() * 10000)}`

export function getPublicIdFromCloudinaryUrl(url: string) {
  // Use a regex pattern to match the structure of the URL and extract the public ID
  const match = url.match(/\/v\d+\/([\w-]+)\.\w+$/)

  // Return the matched public ID or null if not found
  return match ? match[1] : null
}

export async function generateIntegritySignature({
  reference,
  amountInCents,
  currency,
  expirationTime = '',
  integritySecret
}: {
  reference: string
  amountInCents: number
  currency: string
  expirationTime?: string
  integritySecret: string
}): Promise<string> {
  const stringToSign = `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`
  const encodedText = new TextEncoder().encode(stringToSign)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encodedText)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function parseOrderDetails(input: string | null | undefined): {
  customer_email: string
  payment_method_type: string
} {
  if (input === null || input === undefined) {
    return {
      customer_email: '',
      payment_method_type: ''
    }
  }
  const keyValuePairs = input.split(' | ')
  let parsedData = {
    customer_email: '',
    payment_method_type: ''
  }

  keyValuePairs.forEach((pair) => {
    const [key, value] = pair.split(': ').map((item) => item.trim())
    if (key === 'customer_email') {
      parsedData.customer_email = value
    } else if (key === 'payment_method_type') {
      parsedData.payment_method_type = value
    }
  })

  return parsedData
}
