import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/account/saved-searches`;

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

const authorizationHeaders = (sessionToken: string) => ({ Authorization: `Bearer ${sessionToken}` });

export async function getSavedSearches(sessionToken: string): Promise<SavedSearch[]> {
  const response = await axios.get<{ searches: SavedSearch[] }>(API_URL, { headers: authorizationHeaders(sessionToken) });
  return response.data.searches;
}

export async function createSavedSearch(sessionToken: string, input: { name: string; query: string }) {
  const response = await axios.post<{ search: SavedSearch; duplicate?: boolean }>(API_URL, input, { headers: authorizationHeaders(sessionToken) });
  return response.data;
}

export async function deleteSavedSearch(sessionToken: string, id: string) {
  await axios.delete(`${API_URL}?id=${encodeURIComponent(id)}`, { headers: authorizationHeaders(sessionToken) });
}
