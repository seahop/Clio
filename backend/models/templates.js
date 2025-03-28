// models/templates.js
const db = require('../db');

const TemplatesModel = {
  /**
   * Get all templates from the database
   * @returns {Promise<Array>} List of templates
   */
  async getAllTemplates() {
    try {
      const result = await db.query(
        'SELECT * FROM log_templates ORDER BY created_at DESC'
      );
      
      // Process the returned rows to parse JSON data
      const templates = result.rows.map(row => {
        // Parse template_data if it's a string
        if (typeof row.template_data === 'string') {
          try {
            row.data = JSON.parse(row.template_data);
          } catch (e) {
            console.error('Error parsing template data:', e);
            row.data = {};
          }
        } else {
          // If it's already an object, just assign it to data property
          row.data = row.template_data;
        }
        
        return row;
      });
      
      return templates;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  },
  
  /**
   * Create a new template
   * @param {Object} templateData - Template data to save
   * @returns {Promise<Object>} Created template
   */
  async createTemplate(templateData) {
    try {
      const { name, data, created_by } = templateData;
      
      // Safely handle the data to ensure proper JSON conversion
      let jsonData;
      
      if (typeof data === 'string') {
        // If data is already a string, make sure it's valid JSON
        try {
          // Parse and re-stringify to ensure valid JSON
          jsonData = JSON.stringify(JSON.parse(data));
        } catch (e) {
          // If it's not valid JSON, assume it's meant to be a literal string
          jsonData = JSON.stringify(data);
        }
      } else {
        // If data is an object, stringify it
        jsonData = JSON.stringify(data);
      }
      
      // Store the data as properly formatted JSON
      const result = await db.query(
        `INSERT INTO log_templates (
          name, template_data, created_by, created_at
        ) VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [
          name,
          jsonData,
          created_by,
          new Date()
        ]
      );
      
      // Process the returned row
      const createdTemplate = result.rows[0];
      
      // Add the data property with the parsed template_data
      try {
        createdTemplate.data = typeof createdTemplate.template_data === 'string'
          ? JSON.parse(createdTemplate.template_data)
          : createdTemplate.template_data;
      } catch (e) {
        console.error('Error parsing created template data:', e);
        createdTemplate.data = {};
      }
      
      return createdTemplate;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  },
  
  /**
   * Update an existing template
   * @param {Number} id - Template ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated template
   */
  async updateTemplate(id, updates) {
    try {
      const { name, data } = updates;
      
      // Build the query dynamically based on provided updates
      let setClause = [];
      let queryParams = [];
      let paramCount = 1;
      
      if (name !== undefined) {
        setClause.push(`name = $${paramCount}`);
        queryParams.push(name);
        paramCount++;
      }
      
      if (data !== undefined) {
        // Safely handle the data to ensure proper JSON conversion
        let jsonData;
        
        if (typeof data === 'string') {
          // If data is already a string, make sure it's valid JSON
          try {
            // Parse and re-stringify to ensure valid JSON
            jsonData = JSON.stringify(JSON.parse(data));
          } catch (e) {
            // If it's not valid JSON, assume it's meant to be a literal string
            jsonData = JSON.stringify(data);
          }
        } else {
          // If data is an object, stringify it
          jsonData = JSON.stringify(data);
        }
        
        setClause.push(`template_data = $${paramCount}`);
        queryParams.push(jsonData);
        paramCount++;
      }
      
      // Add updated_at timestamp
      setClause.push(`updated_at = $${paramCount}`);
      queryParams.push(new Date());
      paramCount++;
      
      // Add ID as the last parameter
      queryParams.push(id);
      
      // Execute the update query
      const query = `
        UPDATE log_templates 
        SET ${setClause.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `;
      
      const result = await db.query(query, queryParams);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Process the returned row
      const updatedTemplate = result.rows[0];
      
      // Add the data property with the parsed template_data
      try {
        updatedTemplate.data = typeof updatedTemplate.template_data === 'string'
          ? JSON.parse(updatedTemplate.template_data)
          : updatedTemplate.template_data;
      } catch (e) {
        console.error('Error parsing updated template data:', e);
        updatedTemplate.data = {};
      }
      
      return updatedTemplate;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  },
  
  /**
   * Delete a template by ID
   * @param {Number} id - Template ID
   * @returns {Promise<Object>} Deleted template
   */
  async deleteTemplate(id) {
    try {
      const result = await db.query(
        'DELETE FROM log_templates WHERE id = $1 RETURNING *',
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Process the returned row
      const deletedTemplate = result.rows[0];
      
      // Add the data property with the parsed template_data
      try {
        deletedTemplate.data = typeof deletedTemplate.template_data === 'string'
          ? JSON.parse(deletedTemplate.template_data)
          : deletedTemplate.template_data;
      } catch (e) {
        console.error('Error parsing deleted template data:', e);
        deletedTemplate.data = {};
      }
      
      return deletedTemplate;
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }
};

module.exports = TemplatesModel;