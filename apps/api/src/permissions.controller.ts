import { Controller, Get } from "@nestjs/common";
import { RequirePermission, matrix } from "./common/permissions";

/** Read-only view of the permission matrix; changes go through the spec and a reviewed release. */
@Controller("permissions")
export class PermissionsController {
  @RequirePermission("permissions:read")
  @Get()
  list() {
    return matrix;
  }
}
