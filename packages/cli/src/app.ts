import fastifyTraps from '@dnlup/fastify-traps';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastify, { FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider
} from 'fastify-type-provider-zod';
import { z } from 'zod';

import { AddressSchema, Cache, OpenStreetMap } from '@gittrends-app/geocoder-core';
import pJson from '../package.json' with { type: 'json' };

type AppOptions = {
  cache: { dirname: string; size?: number };
  debug?: boolean;
};

/**
 * Create a new Fastify instance
 *
 * @returns {FastifyInstance} - The Fastify instance
 */
export function createApp(options: AppOptions): FastifyInstance {
  const app = fastify({ logger: options.debug });

  // Handle signals and timeouts
  app.register(fastifyTraps);

  // Add schema validator and serializer
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'GitTrends Geocoder',
        description: 'Geocode github users location',
        version: pJson.version
      }
    },
    transform: jsonSchemaTransform
  });

  app.register(fastifySwaggerUI, {
    routePrefix: '/docs'
  });

  const geocoder = new Cache(new OpenStreetMap(), {
    dirname: options.cache.dirname,
    size: options.cache?.size
  });

  app.after(async () => {
    app.get('/', async (req, res) => {
      res.redirect('/docs');
    });

    app.withTypeProvider<ZodTypeProvider>().route({
      method: 'GET',
      url: '/search',
      schema: {
        tags: ['Geocoder'],
        summary: 'Geocode an address',
        querystring: z.object({
          q: z.string().min(1).describe('The address to geocode')
        }),
        response: {
          200: AddressSchema
        }
      },
      handler: async (req, res) => {
        const controller = new AbortController();
        req.raw.on('close', () => controller.abort('Request aborted'));
        const q = req.query.q.toLowerCase().trim().replace(/[,]/g, '').replace(/\s+/g, ' ');
        const address = await geocoder.search(q, { signal: controller.signal });
        if (address) res.send(address);
        else res.status(404).send();
      }
    });
  });

  return app;
}
