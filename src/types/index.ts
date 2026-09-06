export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  supplierPrice: number;
  stock: number;

  supplierId?: string | null;
  supplierName?: string | null;
  supplierCompanyName?: string | null;
  supplierWhatsapp?: string | null;
  supplierEmail?: string | null;
  supplierCity?: string | null;
  supplierState?: string | null;
  supplierShippingTime?: string | null;
  /** Quanto o fornecedor cobra por pedido pela embalagem. Zero quando não cobra. */
  supplierPackagingFee?: number;

  /** Fotos adicionais do catálogo. A principal continua em `image`. */
  images?: string[];
}

export interface UserProduct {
  id: string;
  productId?: string;
  name: string;
  image: string;

  supplierId?: string | null;
  supplierName?: string | null;
  supplierCompanyName?: string | null;
  supplierWhatsapp?: string | null;
  supplierEmail?: string | null;
  supplierShippingTime?: string | null;

  /** Fotos adicionais do catálogo. A principal continua em `image`. */
  images?: string[];
  supplierLocation?: string | null;

  supplierPrice: number;
  salePrice: number;
  margin: number;
  marginPercentage?: number;

  status: 'active' | 'paused' | 'inactive' | 'draft';
  publishedAt: string;
  marketplace: string;

  announcement?: {
    title: string;
    description: string;
    category: string;
    price: number;
    image: string;
  };
}

export interface Supplier {
  id: string;
  name: string;
  companyName?: string;
  company_name?: string;
  email?: string;
  whatsapp?: string;
  phone?: string;
  city?: string;
  state?: string;
  category?: string;
  averageShippingTime?: string;
  average_shipping_time?: string;
  status?: 'active' | 'inactive';
  notes?: string;
  products?: number;
  rating?: number;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface Order {
  id: string;

  productId?: string;
  productName: string;
  productImage?: string;

  customerName: string;
  customerEmail?: string;
  customerPhone?: string;

  supplierId?: string | null;
  supplierName?: string | null;
  supplierWhatsapp?: string | null;

  supplierPrice?: number;
  salePrice: number;
  profit: number;

  status:
    | 'pending'
    | 'sent_to_supplier'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled';

  marketplace: string;
  trackingCode?: string;
  orderDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'start' | 'pro' | 'premium' | 'enterprise';
  status?: 'active' | 'inactive' | 'trial' | 'blocked';
  productsCount?: number;
  ordersCount?: number;
  revenue?: number;
  createdAt?: string;
}

export interface FinancialStats {
  totalRevenue: number;
  totalProfit: number;
  totalOrders: number;
  averageMargin: number;
  availableProducts?: number;
  activeProducts?: number;
  pendingOrders?: number;
  deliveredOrders?: number;
  monthlyRevenue?: number;
  monthlyProfit?: number;
}