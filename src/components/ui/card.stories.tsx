import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Simple = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Site health</CardTitle>
      <CardDescription>What visitors see on your live site.</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">All checks look good on the latest publish.</p>
    </CardContent>
    <CardFooter>
      <Button size="sm">Open report</Button>
    </CardFooter>
  </Card>
);
