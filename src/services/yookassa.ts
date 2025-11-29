import axios from 'axios';
import crypto from 'crypto';

interface YooKassaConfig {
  shopId: string;
  secretKey: string;
}

interface CreatePaymentParams {
  amount: {
    value: string;
    currency: string;
  };
  description: string;
  capture: boolean;
  metadata?: Record<string, any>;
}

interface PaymentResponse {
  id: string;
  status: string;
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  created_at: string;
  metadata?: Record<string, any>;
}

class YooKassaService {
  private config: YooKassaConfig;
  private apiUrl = 'https://api.yookassa.ru/v3';

  constructor() {
    this.config = {
      shopId: process.env.YOOKASSA_SHOP_ID || '',
      secretKey: process.env.YOOKASSA_SECRET_KEY || ''
    };

    if (!this.config.shopId || !this.config.secretKey) {
      console.warn('⚠️ YooKassa credentials not configured');
    }
  }

  private generateIdempotenceKey(): string {
    return crypto.randomUUID();
  }

  private getAuthHeader(): string {
    const credentials = `${this.config.shopId}:${this.config.secretKey}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResponse> {
    try {
      const response = await axios.post<PaymentResponse>(
        `${this.apiUrl}/payments`,
        {
          amount: params.amount,
          capture: params.capture,
          description: params.description,
          metadata: params.metadata,
          confirmation: {
            type: 'redirect',
            return_url: process.env.PAYMENT_RETURN_URL || 'https://t.me/your_bot'
          }
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Idempotence-Key': this.generateIdempotenceKey(),
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('YooKassa create payment error:', error.response?.data || error.message);
      throw new Error('Ошибка создания платежа');
    }
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    try {
      const response = await axios.get<PaymentResponse>(
        `${this.apiUrl}/payments/${paymentId}`,
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('YooKassa get payment error:', error.response?.data || error.message);
      throw new Error('Ошибка получения статуса платежа');
    }
  }

  async capturePayment(paymentId: string, amount?: { value: string; currency: string }): Promise<PaymentResponse> {
    try {
      const response = await axios.post<PaymentResponse>(
        `${this.apiUrl}/payments/${paymentId}/capture`,
        amount ? { amount } : {},
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Idempotence-Key': this.generateIdempotenceKey(),
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('YooKassa capture payment error:', error.response?.data || error.message);
      throw new Error('Ошибка подтверждения платежа');
    }
  }

  async cancelPayment(paymentId: string): Promise<PaymentResponse> {
    try {
      const response = await axios.post<PaymentResponse>(
        `${this.apiUrl}/payments/${paymentId}/cancel`,
        {},
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Idempotence-Key': this.generateIdempotenceKey(),
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('YooKassa cancel payment error:', error.response?.data || error.message);
      throw new Error('Ошибка отмены платежа');
    }
  }

  validateWebhookSignature(body: string, signature: string): boolean {
    const hash = crypto
      .createHmac('sha256', this.config.secretKey)
      .update(body)
      .digest('hex');
    
    return hash === signature;
  }

  async createPayout(amount: string, cardNumber: string, description: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/payouts`,
        {
          amount: {
            value: amount,
            currency: 'RUB'
          },
          payout_destination_data: {
            type: 'bank_card',
            card: {
              number: cardNumber
            }
          },
          description: description,
          metadata: {}
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Idempotence-Key': this.generateIdempotenceKey(),
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error: any) {
      console.error('YooKassa create payout error:', error.response?.data || error.message);
      throw new Error('Ошибка создания выплаты');
    }
  }

  async handleWebhook(notification: any): Promise<void> {
    const { type, object } = notification;

    if (type === 'payment.succeeded') {
      console.log(`✅ Payment succeeded: ${object.id}`);
    } else if (type === 'payment.canceled') {
      console.log(`❌ Payment canceled: ${object.id}`);
    } else if (type === 'payment.waiting_for_capture') {
      console.log(`⏳ Payment waiting for capture: ${object.id}`);
    }
  }
}

export default new YooKassaService();
