import type { Metadata } from "next";
import { AdminClient } from "./AdminClient";

export const metadata: Metadata = {
  title: "Administrar | Predicciones de la Velada VI",
};

export default function AdminPage() {
  return <AdminClient />;
}
