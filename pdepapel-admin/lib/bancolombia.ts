import axios, { AxiosResponse } from 'axios'
import { env } from './env.mjs'

interface AccessTokenResponse {
  token_type: string
  access_token: string
  expires_in: number
}

interface AccessToken {
  authToken: string
  expirationTime: number
}

class BancolombiaService {
  private clientId: string
  private clientSecret: string
  private oauthApi: string

  constructor(
    clientId: string = env.BANCOLOMBIA_CLIENT_ID,
    clientSecret: string = env.BANCOLOMBIA_CLIENT_SECRET,
    oauthApi: string = env.BANCOLOMBIA_SANDBOX_API_URL
  ) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.oauthApi = oauthApi
  }

  /**
   * Generates an access token for Bancolombia API.
   *
   * This function sends a POST request to the Bancolombia OAuth API with the client ID and client secret
   * to generate an access token. The access token is then returned along with its type and expiration time.
   *
   * @returns {Promise<AccessToken>} A promise that resolves to an object containing the access token string,
   * the token type, and the expiration time in milliseconds since the Unix epoch.
   *
   * @throws Will throw an error if the access token generation fails.
   */
  public async generateAccessToken(): Promise<AccessToken> {
    const auth: string = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString('base64')
    const params: URLSearchParams = new URLSearchParams()
    params.append('grant_type', 'client_credentials')
    params.append(
      'scope',
      'Transfer-Intention:write:app Transfer-Intention:read:app'
    )
    const url: string = `${this.oauthApi}/security/oauth-provider/oauth2/token`
    try {
      const {
        data: {
          token_type: tokenType,
          access_token: accessToken,
          expires_in: expiresIn
        }
      }: AxiosResponse<AccessTokenResponse> = await axios.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Authorization: `Basic ${auth}`
        }
      })
      return {
        authToken: `${tokenType} ${accessToken}`,
        expirationTime: new Date().getTime() + expiresIn * 1000
      }
    } catch (error: any) {
      console.error(
        '[BancolombiaService] Error generating access token:',
        error
      )
      throw error
    }
  }
}

export default BancolombiaService
