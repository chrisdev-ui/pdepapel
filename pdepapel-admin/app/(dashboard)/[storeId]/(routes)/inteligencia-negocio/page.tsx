import { BiDashboard } from "./components/bi-dashboard";

export const revalidate = 0;

export default async function BIDashboardPage(props: { params: { storeId: string }; searchParams: { month?: string; year?: string } }) {
  return <BiDashboard {...props} />;
}
