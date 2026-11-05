import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Default = () => (
  <Alert className="max-w-lg">
    <AlertTitle>Heads up</AlertTitle>
    <AlertDescription>Publish when you are happy with the draft. Visitors only see the live site.</AlertDescription>
  </Alert>
);
