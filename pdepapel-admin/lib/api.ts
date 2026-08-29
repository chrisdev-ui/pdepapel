import axios, { AxiosError, AxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 60000,
});

export const makeApiCall = async <T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  data?: T[] | T,
  config?: AxiosRequestConfig,
) => {
  try {
    const response = await api({
      method,
      url: endpoint,
      data,
      ...config,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(
        "API call failed:",
        axiosError.response?.data || axiosError.message,
      );
    } else {
      console.error("An unexpected error occurred:", error);
    }

    throw error;
  }
};

export default api;
