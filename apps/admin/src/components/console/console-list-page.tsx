import { Badge } from "@repo/ui/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Link } from "@tanstack/react-router";

import { CallsMeter } from "@/components/shared/calls-meter";
import type { ConsoleDeveloper } from "@/lib/api";
import { m } from "@/paraglide/messages.js";

/** The developer accounts the reader is a member of, when there are several. */
export function ConsoleListPage({ developers }: { developers: ConsoleDeveloper[] }) {
  return (
    <>
      <h1 className="text-l font-medium">{m.nav_developers()}</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{m.developer_name()}</TableHead>
            <TableHead>{m.developer_calls_this_hour()}</TableHead>
            <TableHead className="text-right">{m.console_keys_working()}</TableHead>
            <TableHead>{m.state()}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {developers.map((developer) => (
            <TableRow key={developer.id}>
              <TableCell className="max-w-64 truncate font-medium">
                <Link
                  to="/console/$developerId"
                  params={{ developerId: developer.id }}
                  className="focus-ring rounded-(--radius-xs) underline-offset-4 outline-none hover:underline"
                >
                  {developer.name}
                </Link>
              </TableCell>
              <TableCell>
                <CallsMeter
                  calls={developer.callsThisHour}
                  limit={developer.callsPerHour}
                  label={m.developer_calls_this_hour()}
                />
              </TableCell>
              {/* None works while the developer account is suspended. */}
              <TableCell className="text-right tabular-nums">
                {developer.suspendedAt
                  ? 0
                  : developer.keys.filter((key) => key.revokedAt === null).length}
              </TableCell>
              <TableCell>
                {developer.suspendedAt ? (
                  <Badge variant="warning">{m.developer_suspended()}</Badge>
                ) : (
                  <Badge variant="success">{m.developer_active()}</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
