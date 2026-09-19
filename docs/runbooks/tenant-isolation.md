# Tenant isolation verification runbook

## Goal

Prove that a user in organization A cannot read, insert, update, delete, publish, invite, or otherwise access organization B data unless an explicit product rule grants that capability.

## Required matrix

For two non-production users and two organizations, test:

| Operation | Same organization | Other organization |
| --- | --- | --- |
| Read | allow when policy permits | deny |
| Insert | allow when policy permits | deny |
| Update | allow when policy permits | deny |
| Delete | allow when policy permits | deny |
| Publish | allow when authorized | deny |
| Invite | allow when authorized | deny |

Repeat for every table storing organization ownership and every server/browser entry point that accepts an organization identifier.

## Adversarial cases

- forged organization IDs;
- forged role/ownership values;
- direct PostgREST access where applicable;
- expired or revoked shared links;
- portal/preview access;
- cross-tenant identifiers supplied to server actions.

Static SQL review is useful but is not a substitute for authenticated runtime tests.

## Release rule

Any unauthorized cross-tenant read or write is a release blocker. Add a regression test and rerun the isolation matrix before rollout.
