import { z } from 'zod';
export declare const EvidenceKind: z.ZodEnum<{
    provider_field: "provider_field";
    provider_page: "provider_page";
    computed: "computed";
    user_statement: "user_statement";
    unverified: "unverified";
}>;
export declare const EvidenceRef: z.ZodObject<{
    kind: z.ZodEnum<{
        provider_field: "provider_field";
        provider_page: "provider_page";
        computed: "computed";
        user_statement: "user_statement";
        unverified: "unverified";
    }>;
    source: z.ZodString;
    field: z.ZodOptional<z.ZodString>;
    url: z.ZodOptional<z.ZodString>;
    confidence: z.ZodNumber;
    observedAt: z.ZodString;
}, z.core.$strip>;
export type EvidenceRefT = z.infer<typeof EvidenceRef>;
export declare const AttributeValue: z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>;
export type AttributeValueT = z.infer<typeof AttributeValue>;
export declare const ProductAttribute: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
    unit: z.ZodOptional<z.ZodString>;
    numericValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    evidence: z.ZodObject<{
        kind: z.ZodEnum<{
            provider_field: "provider_field";
            provider_page: "provider_page";
            computed: "computed";
            user_statement: "user_statement";
            unverified: "unverified";
        }>;
        source: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
        observedAt: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ProductAttributeT = z.infer<typeof ProductAttribute>;
export declare const AvailabilityStatus: z.ZodEnum<{
    unknown: "unknown";
    in_stock: "in_stock";
    out_of_stock: "out_of_stock";
    preorder: "preorder";
    backorder: "backorder";
}>;
export declare const Availability: z.ZodObject<{
    status: z.ZodEnum<{
        unknown: "unknown";
        in_stock: "in_stock";
        out_of_stock: "out_of_stock";
        preorder: "preorder";
        backorder: "backorder";
    }>;
    quantity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    observedAt: z.ZodString;
    evidence: z.ZodOptional<z.ZodObject<{
        kind: z.ZodEnum<{
            provider_field: "provider_field";
            provider_page: "provider_page";
            computed: "computed";
            user_statement: "user_statement";
            unverified: "unverified";
        }>;
        source: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
        observedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AvailabilityT = z.infer<typeof Availability>;
export declare const ProductCategory: z.ZodEnum<{
    laptop: "laptop";
    desktop: "desktop";
    components: "components";
    monitor: "monitor";
    accessory: "accessory";
    phone: "phone";
    tablet: "tablet";
    audio: "audio";
    other: "other";
}>;
export type ProductCategoryT = z.infer<typeof ProductCategory>;
export declare const Product: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    externalId: z.ZodString;
    title: z.ZodString;
    brand: z.ZodOptional<z.ZodString>;
    category: z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>;
    price: z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>;
    listPrice: z.ZodOptional<z.ZodObject<{
        amount: z.ZodNumber;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
    }, z.core.$strip>>;
    currency: z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>;
    attributes: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
        unit: z.ZodOptional<z.ZodString>;
        numericValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        evidence: z.ZodObject<{
            kind: z.ZodEnum<{
                provider_field: "provider_field";
                provider_page: "provider_page";
                computed: "computed";
                user_statement: "user_statement";
                unverified: "unverified";
            }>;
            source: z.ZodString;
            field: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodNumber;
            observedAt: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    availability: z.ZodObject<{
        status: z.ZodEnum<{
            unknown: "unknown";
            in_stock: "in_stock";
            out_of_stock: "out_of_stock";
            preorder: "preorder";
            backorder: "backorder";
        }>;
        quantity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        observedAt: z.ZodString;
        evidence: z.ZodOptional<z.ZodObject<{
            kind: z.ZodEnum<{
                provider_field: "provider_field";
                provider_page: "provider_page";
                computed: "computed";
                user_statement: "user_statement";
                unverified: "unverified";
            }>;
            source: z.ZodString;
            field: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodNumber;
            observedAt: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    sourceUrl: z.ZodString;
    evidenceRefs: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            provider_field: "provider_field";
            provider_page: "provider_page";
            computed: "computed";
            user_statement: "user_statement";
            unverified: "unverified";
        }>;
        source: z.ZodString;
        field: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        confidence: z.ZodNumber;
        observedAt: z.ZodString;
    }, z.core.$strip>>;
    retrievedAt: z.ZodString;
    raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type ProductT = z.infer<typeof Product>;
export declare const NumericOperator: z.ZodEnum<{
    gte: "gte";
    lte: "lte";
    eq: "eq";
    gt: "gt";
    lt: "lt";
    between: "between";
}>;
export declare const CatalogSearchRequest: z.ZodObject<{
    query: z.ZodString;
    category: z.ZodOptional<z.ZodEnum<{
        laptop: "laptop";
        desktop: "desktop";
        components: "components";
        monitor: "monitor";
        accessory: "accessory";
        phone: "phone";
        tablet: "tablet";
        audio: "audio";
        other: "other";
    }>>;
    currency: z.ZodOptional<z.ZodEnum<{
        USD: "USD";
        EUR: "EUR";
        GBP: "GBP";
        CAD: "CAD";
        AUD: "AUD";
        JPY: "JPY";
    }>>;
    maxPrice: z.ZodOptional<z.ZodNumber>;
    minPrice: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    includeOutOfStock: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type CatalogSearchRequestT = z.infer<typeof CatalogSearchRequest>;
export declare const CatalogSearchResponse: z.ZodObject<{
    provider: z.ZodString;
    degraded: z.ZodBoolean;
    degradedReason: z.ZodOptional<z.ZodString>;
    tookMs: z.ZodNumber;
    products: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        provider: z.ZodString;
        externalId: z.ZodString;
        title: z.ZodString;
        brand: z.ZodOptional<z.ZodString>;
        category: z.ZodEnum<{
            laptop: "laptop";
            desktop: "desktop";
            components: "components";
            monitor: "monitor";
            accessory: "accessory";
            phone: "phone";
            tablet: "tablet";
            audio: "audio";
            other: "other";
        }>;
        price: z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>;
        listPrice: z.ZodOptional<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>>;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
        attributes: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            unit: z.ZodOptional<z.ZodString>;
            numericValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            evidence: z.ZodObject<{
                kind: z.ZodEnum<{
                    provider_field: "provider_field";
                    provider_page: "provider_page";
                    computed: "computed";
                    user_statement: "user_statement";
                    unverified: "unverified";
                }>;
                source: z.ZodString;
                field: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                confidence: z.ZodNumber;
                observedAt: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        availability: z.ZodObject<{
            status: z.ZodEnum<{
                unknown: "unknown";
                in_stock: "in_stock";
                out_of_stock: "out_of_stock";
                preorder: "preorder";
                backorder: "backorder";
            }>;
            quantity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            observedAt: z.ZodString;
            evidence: z.ZodOptional<z.ZodObject<{
                kind: z.ZodEnum<{
                    provider_field: "provider_field";
                    provider_page: "provider_page";
                    computed: "computed";
                    user_statement: "user_statement";
                    unverified: "unverified";
                }>;
                source: z.ZodString;
                field: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                confidence: z.ZodNumber;
                observedAt: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        sourceUrl: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                provider_field: "provider_field";
                provider_page: "provider_page";
                computed: "computed";
                user_statement: "user_statement";
                unverified: "unverified";
            }>;
            source: z.ZodString;
            field: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodNumber;
            observedAt: z.ZodString;
        }, z.core.$strip>>;
        retrievedAt: z.ZodString;
        raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CatalogSearchResponseT = z.infer<typeof CatalogSearchResponse>;
export declare const ProductDetailsResponse: z.ZodObject<{
    product: z.ZodObject<{
        id: z.ZodString;
        provider: z.ZodString;
        externalId: z.ZodString;
        title: z.ZodString;
        brand: z.ZodOptional<z.ZodString>;
        category: z.ZodEnum<{
            laptop: "laptop";
            desktop: "desktop";
            components: "components";
            monitor: "monitor";
            accessory: "accessory";
            phone: "phone";
            tablet: "tablet";
            audio: "audio";
            other: "other";
        }>;
        price: z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>;
        listPrice: z.ZodOptional<z.ZodObject<{
            amount: z.ZodNumber;
            currency: z.ZodEnum<{
                USD: "USD";
                EUR: "EUR";
                GBP: "GBP";
                CAD: "CAD";
                AUD: "AUD";
                JPY: "JPY";
            }>;
        }, z.core.$strip>>;
        currency: z.ZodEnum<{
            USD: "USD";
            EUR: "EUR";
            GBP: "GBP";
            CAD: "CAD";
            AUD: "AUD";
            JPY: "JPY";
        }>;
        attributes: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            value: z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
            unit: z.ZodOptional<z.ZodString>;
            numericValue: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            evidence: z.ZodObject<{
                kind: z.ZodEnum<{
                    provider_field: "provider_field";
                    provider_page: "provider_page";
                    computed: "computed";
                    user_statement: "user_statement";
                    unverified: "unverified";
                }>;
                source: z.ZodString;
                field: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                confidence: z.ZodNumber;
                observedAt: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>>;
        availability: z.ZodObject<{
            status: z.ZodEnum<{
                unknown: "unknown";
                in_stock: "in_stock";
                out_of_stock: "out_of_stock";
                preorder: "preorder";
                backorder: "backorder";
            }>;
            quantity: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            observedAt: z.ZodString;
            evidence: z.ZodOptional<z.ZodObject<{
                kind: z.ZodEnum<{
                    provider_field: "provider_field";
                    provider_page: "provider_page";
                    computed: "computed";
                    user_statement: "user_statement";
                    unverified: "unverified";
                }>;
                source: z.ZodString;
                field: z.ZodOptional<z.ZodString>;
                url: z.ZodOptional<z.ZodString>;
                confidence: z.ZodNumber;
                observedAt: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        sourceUrl: z.ZodString;
        evidenceRefs: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                provider_field: "provider_field";
                provider_page: "provider_page";
                computed: "computed";
                user_statement: "user_statement";
                unverified: "unverified";
            }>;
            source: z.ZodString;
            field: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodString>;
            confidence: z.ZodNumber;
            observedAt: z.ZodString;
        }, z.core.$strip>>;
        retrievedAt: z.ZodString;
        raw: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, z.core.$strip>;
    provider: z.ZodString;
    tookMs: z.ZodNumber;
}, z.core.$strip>;
export type ProductDetailsResponseT = z.infer<typeof ProductDetailsResponse>;
//# sourceMappingURL=product.d.ts.map