import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { format, parseISO } from "date-fns";
import { sk as skLocale, cs as csLocale, enUS as enLocale } from "date-fns/locale";
import { ArrowLeft, AlertCircle, CheckCircle2, Clock, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

interface PaymentDetail {
  id: number;
  amount: number;
  walletAppliedAmount: number;
  outstandingAmount: number;
  dueDate: string;
  variableSymbol: string | null;
  description: string;
  status: string;
  recipientIban: string | null;
  recipientName: string;
  currency: string;
  qrPayload: string | null;
}

function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { lang, t } = useI18n();
  const dateLocale = lang === "sk" ? skLocale : lang === "cz" ? csLocale : enLocale;
  const statusConfig = {
    paid: { label: t("payments.paid"), variant: "default" as const, icon: CheckCircle2, color: "text-green-600" },
    pending: { label: t("paymentDetail.pendingPay"), variant: "secondary" as const, icon: Clock, color: "text-yellow-600" },
    overdue: { label: t("payments.overdue"), variant: "destructive" as const, icon: AlertCircle, color: "text-red-600" },
  };
  const { data: payment, isLoading, error } = useQuery<PaymentDetail>({
    queryKey: ["/api/payments", id],
  });

  if (isLoading) {
    return <p className="p-8 text-center text-muted-foreground">{t("paymentDetail.loading")}</p>;
  }

  if (error || !payment) {
    return (
      <div className="space-y-4">
        <Link href="/payments"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />{t("common.back")}</Button></Link>
        <p className="text-sm text-destructive">{t("paymentDetail.loadFailed")}</p>
      </div>
    );
  }

  const status = statusConfig[payment.status as keyof typeof statusConfig] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/payments">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ArrowLeft className="w-4 h-4 mr-1" />{t("paymentDetail.backToList")}
        </Button>
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-xl font-bold">{payment.description}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("paymentDetail.detail", { id: payment.id })}</p>
        </div>
        <Badge variant={status.variant} className="shrink-0">
          <StatusIcon className={`w-3.5 h-3.5 mr-1 ${status.color}`} />{status.label}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Landmark className="w-4 h-4" />{t("paymentDetail.detailsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t("paymentDetail.totalAmount")}</p>
            <p className="font-semibold text-lg">{payment.amount} {payment.currency}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("paymentDetail.dueDate")}</p>
            <p className="font-medium">{format(parseISO(payment.dueDate), "d. MMMM yyyy", { locale: dateLocale })}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("paymentDetail.variableSymbol")}</p>
            <p className="font-mono font-semibold" data-testid="text-payment-vs">{payment.variableSymbol}</p>
          </div>
          {payment.walletAppliedAmount > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">{t("paymentDetail.paidFromWallet")}</p>
              <p className="font-semibold text-green-700 dark:text-green-400">{payment.walletAppliedAmount} {payment.currency}</p>
            </div>
          )}
          {payment.outstandingAmount > 0 && payment.walletAppliedAmount > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">{t("paymentDetail.remainingToPay")}</p>
              <p className="font-semibold text-yellow-700 dark:text-yellow-400">{payment.outstandingAmount} {payment.currency}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{t("paymentDetail.recipient")}</p>
            <p className="font-medium">{payment.recipientName}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">IBAN</p>
            <p className="font-mono font-medium break-all">{payment.recipientIban ? formatIban(payment.recipientIban) : t("paymentDetail.notSet")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("paymentDetail.qrTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payment.qrPayload ? (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl bg-white p-3 border" data-testid="payment-qr-code">
                <QRCodeSVG value={payment.qrPayload} size={240} level="M" />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {t("paymentDetail.qrHint", { amount: payment.outstandingAmount, currency: payment.currency })}
              </p>
            </div>
          ) : payment.outstandingAmount === 0 ? (
            <div className="rounded-lg border border-green-600/30 bg-green-600/5 p-5 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium">{t("paymentDetail.fullyPaidFromWallet")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("paymentDetail.zeroRemaining", { currency: payment.currency })}</p>
            </div>
          ) : payment.status === "paid" ? (
            <div className="rounded-lg border border-green-600/30 bg-green-600/5 p-5 text-center">
              <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium">{t("paymentDetail.markedPaid")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("paymentDetail.qrNotNeeded")}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-5 text-center">
              <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">{t("paymentDetail.qrUnavailable")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("paymentDetail.qrUnavailableHint")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
