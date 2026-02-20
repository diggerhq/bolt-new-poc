import { redirect } from "next/navigation";

export default async function Home(): Promise<never> {
  redirect("/builder");
}
