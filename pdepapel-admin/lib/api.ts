import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

export const makeApiCall = async <T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  data?: T[] | T,
) => {
  try {
    const response = await api({
      method,
      url: endpoint,
      data,
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
