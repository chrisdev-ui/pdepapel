import BancolombiaService from '@/lib/bancolombia'
import { env } from '@/lib/env.mjs'
import axios from 'axios'

type BancolombiaMetaData = {
  _messageId: string
  _version: string
  _requestDate: string
  _responseSize: number
  _clientRequest: string
}

type BancolombiaTransferRegistryData = {
  header: {
    type: string
    id: string
  }
  transferCode: string
  redirectURL: string
}

interface TransferRegistryRequest {
  commerceTransferButtonId: string
  transferReference: string
  transferAmount: number
  transferDescription: string
}

interface ValidateTransferCodeRequest {
  transferCode: string
}

interface ApiError {
  statusCode: number
  title: string
  code: string
  detail: string
}

interface TransferRegistryResponse {
  meta: BancolombiaMetaData
  data: BancolombiaTransferRegistryData[]
}

class Bancolombia {
  private authorizationToken: string = ''
  private expirationTime: number = 0
  private bancolombiaService: BancolombiaService

  constructor(
    bancolombiaService: BancolombiaService = new BancolombiaService()
  ) {
    this.bancolombiaService = bancolombiaService
    this.refreshAccessToken = this.refreshAccessToken.bind(this)
    this.isTokenValid = this.isTokenValid.bind(this)
    this.getHeaders = this.getHeaders.bind(this)
    this.getUrl = this.getUrl.bind(this)
    this.transferRegistry = this.transferRegistry.bind(this)
    this.validateTransferCode = this.validateTransferCode.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  private async refreshAccessToken(): Promise<void> {
    const tokenInfo = await this.bancolombiaService.generateAccessToken()
    this.authorizationToken = tokenInfo.authToken
    this.expirationTime = tokenInfo.expirationTime
  }

  private isTokenValid(): boolean {
    return new Date().getTime() < this.expirationTime
  }

  private async getHeaders(): Promise<Record<string, string>> {
    if (!this.isTokenValid()) {
      await this.refreshAccessToken()
    }
    return {
      'Content-Type': 'application/vnd.bancolombia.v1+json',
      Accept: 'application/vnd.bancolombia.v1+json',
      Authorization: this.authorizationToken
    }
  }

  private getUrl(endpoint: string): string {
    return `${env.BANCOLOMBIA_SANDBOX_API_URL}${endpoint}`
  }

  private handleError(error: any): ApiError {
    const {
      data: { errors }
    } = error.response
    const { title, code, status, detail } = errors[0]
    return { statusCode: status, title, code, detail }
  }

  public async transferRegistry(
    request: TransferRegistryRequest
  ): Promise<TransferRegistryResponse> {
    try {
      const url = this.getUrl(
        '/v3/operations/cross-product/payments/payment-order/transfer/action/registry'
      )
      const headers = await this.getHeaders()
      const requestBody = {
        data: [
          {
            ...request,
            commerceUrl: `${env.FRONTEND_STORE_URL}/order/${request.transferReference}`,
            confirmationURL: `${env.ADMIN_WEB_URL}/api/webhook/bancolombia`
          }
        ]
      }
      const response = await axios.post(url, requestBody, { headers })
      return response.data
    } catch (error) {
      console.error('[BANCOLOMBIA_TRANSFER_REGISTRY]', error)
      throw this.handleError(error)
    }
  }

  public async validateTransferCode(
    request: ValidateTransferCodeRequest
  ): Promise<any> {
    try {
      const url = this.getUrl(
        `/v3/operations/cross-product/payments/payment-order/transfer/${request.transferCode}/action/validate`
      )
      const headers = await this.getHeaders()
      const response = await axios.get(url, { headers })
      return response.data
    } catch (error) {
      console.error(error)
      throw this.handleError(error)
    }
  }
}

export default Bancolombia
