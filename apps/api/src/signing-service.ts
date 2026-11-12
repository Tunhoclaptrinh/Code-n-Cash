import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth";
import { Public } from "./common/decorators/roles.decorator";
import { Repository } from "./common/repository";
import type { SessionRequest } from "./common/types";
import * as signing from "./domain/signing";
import { DomainService } from "./domain/service";
import { TABLE } from "./domain/records";
import {
  deviceSession,
  enroll,
  ensureCa,
  webhookAuthentic,
  type RemoteTransaction,
} from "./trust/remote-signer";
import { getSigningProvider } from "./trust/signing-provider";

const remoteMode = () => !!getSigningProvider().remote;

/**
 * CodeCash's side of the remote signing service contract (apps/signer/openapi.yaml):
 * - `POST /signing/callback`: the service's webhook, authenticated by an HMAC of the raw body;
 *   the result is applied as the signer it belongs to, and verified again before it counts.
 * - `GET /signing/device-session`: a short-lived token for the signed-in person's device screen
 *   (the corner widget or the phone page), so the device talks to the service directly.
 */
@Controller("signing")
export class SigningServiceController {
  constructor(
    @Inject(DomainService) private domain: DomainService,
    @Inject(Repository) private repo: Repository,
    @Inject(AuthService) private auth: AuthService,
  ) {}

  @Public()
  @Post("callback")
  async callback(@Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    if (!remoteMode()) throw new NotFoundException("SIGNER_DISABLED");
    if (
      !req.rawBody ||
      !webhookAuthentic(req.rawBody, req.headers["x-signer-signature"])
    )
      throw new UnauthorizedException("INVALID_WEBHOOK_SIGNATURE");
    const transaction = (body as { transaction?: RemoteTransaction })
      ?.transaction;
    if (!transaction?.id) return { received: true, ignored: true };
    const request = (await this.repo.list(TABLE.requests)).find(
      (r) => r.transactionId === transaction.id,
    );
    if (!request) return { received: true, ignored: true };
    const record = (await this.repo.list(TABLE.signing)).find(
      (r) => r.contractCode === request.contractCode,
    ) as { steps?: { stepNo: number; signerUserId: string }[] } | undefined;
    const signerUserId = record?.steps?.find(
      (s) => s.stepNo === request.stepNo,
    )?.signerUserId;
    const user = (await this.repo.list("users")).find(
      (u) => u.id === signerUserId,
    );
    if (!user) return { received: true, ignored: true };
    await ensureCa();
    // Applied as the person who confirmed on their device: the same checks as any of their actions.
    await this.domain.write(
      this.auth.actor(user),
      "applySigningResult",
      (ctx) => signing.applyRemoteResult(ctx, transaction),
      String(request.contractCode),
    );
    return { received: true };
  }

  @Get("device-session")
  async deviceSession(@Req() req: SessionRequest) {
    if (!remoteMode()) throw new NotFoundException("SIGNER_DISABLED");
    const actor = req.user;
    const credential = await enroll({
      subscriberId: actor.id,
      commonName: actor.displayName,
      organization: actor.roleChipOrganization ?? "",
    });
    const session = await deviceSession(actor.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      // The browser reaches the service through the gateway path, never with the client secret.
      baseUrl: "/signer-api",
      certificate: {
        serial: credential.certificate.serial,
        commonName: credential.certificate.subject.commonName,
        issuer: credential.certificate.issuer.commonName,
        notAfter: credential.certificate.notAfter,
      },
    };
  }
}
