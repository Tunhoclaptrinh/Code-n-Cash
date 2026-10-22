import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Inject,
} from "@nestjs/common";
import { BaseService } from "../services/base.service";
import type { SessionRequest } from "../types";
@Controller("resources")
export class BaseController {
  constructor(@Inject(BaseService) private service: BaseService) {}
  @Get() definitions() {
    return this.service.definitions;
  }
  @Get(":resource") list(
    @Param("resource") name: string,
    @Query() query: Record<string, unknown>,
    @Req() req: SessionRequest,
  ) {
    return this.service.list(name, query, req.user);
  }
  @Get(":resource/:id") get(
    @Param("resource") name: string,
    @Param("id") id: string,
    @Req() req: SessionRequest,
  ) {
    return this.service.get(name, id, req.user);
  }
  @Post(":resource") create(
    @Param("resource") name: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.service.create(name, body, req.user);
  }
  @Patch(":resource/:id") update(
    @Param("resource") name: string,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.service.update(name, id, body, req.user);
  }
  @Delete(":resource/:id") remove(
    @Param("resource") name: string,
    @Param("id") id: string,
    @Req() req: SessionRequest,
  ) {
    return this.service.remove(name, id, req.user);
  }
  @Post(":resource/import") import(
    @Param("resource") name: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.service.import(name, body, req.user);
  }
  @Post(":resource/bulk-delete") bulkDelete(
    @Param("resource") name: string,
    @Body() body: unknown,
    @Req() req: SessionRequest,
  ) {
    return this.service.bulkDelete(name, body, req.user);
  }
}
