/**
 * Status a public-site lead is saved with. A booking form only REQUESTS a time
 * (the visitor is told it is confirmed later), so it is a new lead, never
 * "booked": owner reports and dashboards count "booked" as a won job. The
 * appointment row carries its own pending status, and the owner moves the lead
 * to "booked" once they confirm.
 */
export function publicLeadStatus(kind: "booking" | "quote" | "enquiry" | string | undefined): "quoted" | "new" {
  return kind === "quote" ? "quoted" : "new";
}
