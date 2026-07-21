import { Product, Order, Ticket, User, Supplier, Tutorial, UserProduct } from '../types';

export const products: Product[] = [
  {
    id: '1',
    name: 'Fone Bluetooth Premium TWS',
    image: 'https://images.pexels.com/photos/3780685/pexels-photo-3780685.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 19.90,
    stock: 234,
    category: 'Eletrônicos',
    description: 'Fone de ouvido wireless com cancelamento de ruído e bateria de longa duração.',
  },
  {
    id: '2',
    name: 'Smartwatch Pro Series X',
    image: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 45.00,
    stock: 156,
    category: 'Eletrônicos',
    description: 'Relógio inteligente com monitor de saúde e GPS integrado.',
  },
  {
    id: '3',
    name: 'Mochila Anti-Furto Urbana',
    image: 'https://images.pexels.com/photos/2905238/pexels-photo-2905238.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 32.50,
    stock: 89,
    category: 'Acessórios',
    description: 'Mochila com porta USB externa e compartimento anti-furto.',
  },
  {
    id: '4',
    name: 'Luminária LED Inteligente',
    image: 'https://images.pexels.com/photos/1112573/pexels-photo-1112573.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 28.00,
    stock: 312,
    category: 'Casa',
    description: 'Luminária de mesa com controle por app e 16 milhões de cores.',
  },
  {
    id: '5',
    name: 'Organizador Modular Kitchen',
    image: 'https://images.pexels.com/photos/5412/agriculture-kitchen.jpg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 15.90,
    stock: 445,
    category: 'Casa',
    description: 'Kit organizadores modulares para gavetas e armários.',
  },
  {
    id: '6',
    name: 'Carregador Turbo 65W',
    image: 'https://images.pexels.com/photos/1630882/pexels-photo-1630882.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 24.90,
    stock: 267,
    category: 'Eletrônicos',
    description: 'Carregador rápido compatível com USB-C e Power Delivery.',
  },
  {
    id: '7',
    name: 'Suporte Celular Veicular',
    image: 'https://images.pexels.com/photos/6224/hand iPhone smart.jpg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 12.50,
    stock: 189,
    category: 'Automotivo',
    description: 'Suporte magnético para celular com fixação no painel.',
  },
  {
    id: '8',
    name: 'Garrafa Térmica Premium',
    image: 'https://images.pexels.com/photos/419909/pexels-photo-419909.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 35.00,
    stock: 78,
    category: 'Lifestyle',
    description: 'Garrafa térmica em aço inox mantém temperatura por 24h.',
  },
];

export const userProducts: UserProduct[] = [
  {
    id: '1',
    productId: '1',
    name: 'Fone Bluetooth Premium TWS',
    image: 'https://images.pexels.com/photos/3780685/pexels-photo-3780685.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 19.90,
    salePrice: 59.90,
    margin: 40.00,
    status: 'active',
    publishedAt: '2026-06-15',
  },
  {
    id: '2',
    productId: '2',
    name: 'Smartwatch Pro Series X',
    image: 'https://images.pexels.com/photos/437037/pexels-photo-437037.jpeg?auto=compress&cs=tinysrgb&w=600',
    supplierPrice: 45.00,
    salePrice: 129.90,
    margin: 84.90,
    status: 'active',
    publishedAt: '2026-06-18',
  },
];

export const orders: Order[] = [
  {
    id: '001',
    customer: 'Maria Silva',
    product: 'Fone Bluetooth Premium TWS',
    date: '2026-06-28',
    value: 59.90,
    status: 'processing',
  },
  {
    id: '002',
    customer: 'João Santos',
    product: 'Smartwatch Pro Series X',
    date: '2026-06-27',
    value: 129.90,
    status: 'shipped',
  },
  {
    id: '003',
    customer: 'Ana Oliveira',
    product: 'Fone Bluetooth Premium TWS',
    date: '2026-06-25',
    value: 59.90,
    status: 'delivered',
  },
  {
    id: '004',
    customer: 'Pedro Costa',
    product: 'Mochila Anti-Furto Urbana',
    date: '2026-06-24',
    value: 89.90,
    status: 'pending',
  },
  {
    id: '005',
    customer: 'Lucia Ferreira',
    product: 'Luminária LED Inteligente',
    date: '2026-06-23',
    value: 79.90,
    status: 'delivered',
  },
];

export const tickets: Ticket[] = [
  {
    id: 'TKT-001',
    subject: 'Dúvida sobre integração Mercado Livre',
    status: 'resolved',
    createdAt: '2026-06-20',
  },
  {
    id: 'TKT-002',
    subject: 'Produto não está sincronizando',
    status: 'in_progress',
    createdAt: '2026-06-27',
  },
];

export const users: User[] = [
  {
    id: '1',
    name: 'Demo User',
    email: 'demo@fornexa.io',
    plan: 'lifetime',
    createdAt: '2026-01-15',
  },
  {
    id: '2',
    name: 'Maria Silva',
    email: 'maria@email.com',
    plan: 'monthly',
    createdAt: '2026-03-22',
  },
  {
    id: '3',
    name: 'João Santos',
    email: 'joao@email.com',
    plan: 'lifetime',
    createdAt: '2026-05-10',
  },
];

export const suppliers: Supplier[] = [
  {
    id: '1',
    name: 'TechSupplier Brasil',
    email: 'contato@techsupplier.br',
    status: 'active',
  },
  {
    id: '2',
    name: 'Home Essentials',
    email: 'parceiros@homeessentials.br',
    status: 'active',
  },
  {
    id: '3',
    name: 'Acessórios Pro',
    email: 'info@acessoriospro.br',
    status: 'active',
  },
];

export const tutorials: Tutorial[] = [
  {
    id: '1',
    title: 'Primeiros passos no Fornexa',
    type: 'video',
    duration: '5:30',
  },
  {
    id: '2',
    title: 'Como conectar o Mercado Livre',
    type: 'video',
    duration: '3:45',
  },
  {
    id: '3',
    title: 'Calculando margens de lucro',
    type: 'pdf',
  },
  {
    id: '4',
    title: 'FAQ - Perguntas frequentes',
    type: 'faq',
  },
];

export const dashboardStats = {
  availableProducts: 1247,
  orders: 23,
  mlConnected: true,
  estimatedProfit: 1847.50,
};

export const financialStats = {
  totalOrders: 23,
  revenue: 4567.80,
  estimatedProfit: 1847.50,
  averageTicket: 198.60,
};
