import { redirect } from "next/navigation";

export default function MetricsUploadRedirect() {
  redirect("/admin/uploads");
}
