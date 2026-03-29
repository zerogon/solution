import Dashboard from "@/components/Dashboard";
import { getAllRates } from "@/db/queries";

export default async function HomePage() {
  const allData = await getAllRates();

  return <Dashboard allData={allData} />;
}
