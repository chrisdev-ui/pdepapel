export interface Billboard {
  id: string;
  label: string;
  imageUrl: string;
}

export interface Type {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  category: Category;
  name: string;
  description: string;
  price: string;
  stock: number;
  ratings: number;
  isFeatured: boolean;
  size: Size;
  color: Color;
  design: Design;
  images: Image[];
}

export interface Category {
  id: string;
  type: Type;
  name: string;
}

export interface Size {
  id: string;
  name: string;
  value: string;
}

export interface Color {
  id: string;
  name: string;
  value: string;
}

export interface Design {
  id: string;
  name: string;
}

export interface Image {
  id: string;
  url: string;
}
