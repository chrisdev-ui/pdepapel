import { env } from "@/lib/env.mjs";
import axios from "axios";

const API_URL = `${env.NEXT_PUBLIC_API_URL}/account/addresses`;

export type CustomerAddress = {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  documentId?: string | null;
  address: string;
  address2?: string | null;
  city?: string | null;
  department?: string | null;
  daneCode?: string | null;
  neighborhood?: string | null;
  addressReference?: string | null;
  company?: string | null;
  isDefault: boolean;
  lastUsedAt?: string | null;
};

const authorizationHeaders = (sessionToken: string) => ({
  Authorization: `Bearer ${sessionToken}`,
});

export async function getCustomerAddresses(sessionToken: string) {
  const response = await axios.get<{ addresses: CustomerAddress[] }>(API_URL, {
    headers: authorizationHeaders(sessionToken),
  });

  return response.data.addresses;
}

export async function deleteCustomerAddress(
  addressId: string,
  sessionToken: string,
) {
  await axios.delete(`${API_URL}/${encodeURIComponent(addressId)}`, {
    headers: authorizationHeaders(sessionToken),
  });
}
